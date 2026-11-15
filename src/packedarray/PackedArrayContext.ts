/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/**
 * A packed-value, sparse array context used for storing 64 bit signed values.
 *
 * An array context is optimised for tracking sparsely set (as in mostly zeros) values that tend to not make
 * use pof the full 64 bit value range even when they are non-zero. The array context's internal representation
 * is such that the packed value at each virtual array index may be represented by 0-8 bytes of actual storage.
 *
 * An array context encodes the packed values in 8 "set trees" with each set tree representing one byte of the
 * packed value at the virtual index in question. The {@link #getPackedIndex(int, int, boolean)} method is used
 * to look up the byte-index corresponding to the given (set tree) value byte of the given virtual index, and can
 * be used to add entries to represent that byte as needed. As a succesful {@link #getPackedIndex(int, int, boolean)}
 * may require a resizing of the array, it can throw a {@link ResizeException} to indicate that the requested
 * packed index cannot be found or added without a resize of the physical storage.
 *
 */
export const MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY = 16;
/**
 * A packed context addresses its entries with 16 bit indexes (Java shorts, hence
 * Short.MAX_VALUE / 4 longs). Beyond this physical length the context is unpacked:
 * one 64 bit value per virtual index.
 */
export const MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH = 8191;
const SET_0_START_INDEX = 0;
const NUMBER_OF_SETS = 8;
// A leaf of a set covers the 2^leafLevelShift virtual indexes sharing their high bits.
// Set 0 is the dense byte (most recorded values only use it), so its leaves can be 16 bytes wide:
// the set tree is one level shallower for some virtual lengths, and a 16 index block shares one
// leaf. A populated leaf costs its whole width, though: a lone value costs 16 bytes instead of 8,
// which fills the 16 bit packed addresses sooner for large sparse arrays. So the wide leaves are
// only used up to WIDE_SET_0_LEAVES_MAX_VIRTUAL_LENGTH, and the other sets keep 8 bytes.
const LEAF_LEVEL_SHIFT = 3;
const WIDE_SET_0_LEAF_LEVEL_SHIFT = 4;
export const WIDE_SET_0_LEAVES_MAX_VIRTUAL_LENGTH = 1 << 15;

/** @return the leaf level shift of a set, for a virtual length */
const leafLevelShiftFor = (setNumber: number, virtualLength: number) =>
  setNumber === 0 && virtualLength <= WIDE_SET_0_LEAVES_MAX_VIRTUAL_LENGTH
    ? WIDE_SET_0_LEAF_LEVEL_SHIFT
    : LEAF_LEVEL_SHIFT;
const NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET = 0;
const NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS = 1;
const PACKED_ARRAY_GROWTH_INCREMENT = 16;
const PACKED_ARRAY_GROWTH_FRACTION_POW2 = 4;

const { ceil, log2, max } = Math;

const bitCount = (n: number) => {
  var bits = 0;
  while (n !== 0) {
    bits += bitCount32(n | 0);
    n /= 0x100000000;
  }
  return bits;
};

const bitCount32 = (n: number) => {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
};

export class PackedArrayContext {
  public readonly isPacked: boolean;
  physicalLength: number;

  private array: ArrayBuffer;
  private byteArray: Uint8Array;
  private shortArray: Uint16Array;
  private longArray: Float64Array;
  private populatedShortLength: number = 0;
  private virtualLength: number;
  // Per set, make it non-sensical until properly initialized.
  private topLevelShiftBySet: number[] = new Array(NUMBER_OF_SETS).fill(
    Number.MAX_VALUE
  );
  // Per set layout of the leaves, for the virtual length of this context
  private leafLevelShiftBySet: number[] = new Array(NUMBER_OF_SETS).fill(
    LEAF_LEVEL_SHIFT
  );
  /** Mask of the virtual index bits selecting the byte within a leaf, per set (read by the hot loops) */
  public leafByteMaskBySet: number[] = [7, 7, 7, 7, 7, 7, 7, 7];
  private leafLengthInLongsBySet: number[] = new Array(NUMBER_OF_SETS).fill(1);

  constructor(virtualLength: number, initialPhysicalLength: number) {
    this.physicalLength = Math.max(
      initialPhysicalLength,
      MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY
    );
    this.isPacked =
      this.physicalLength <= MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH;
    if (!this.isPacked) {
      this.physicalLength = virtualLength;
    }
    this.array = new ArrayBuffer(this.physicalLength * 8);
    this.initArrayViews(this.array);
    this.init(virtualLength);
  }

  private initArrayViews(array: ArrayBuffer) {
    this.byteArray = new Uint8Array(array);
    this.shortArray = new Uint16Array(array);
    this.longArray = new Float64Array(array);
  }

  private init(virtualLength: number) {
    if (!this.isPacked) {
      // Deal with non-packed context init:
      this.virtualLength = virtualLength;
      return;
    }

    this.populatedShortLength = SET_0_START_INDEX + 8;

    // Populate empty root entries, and point to them from the root indexes:
    for (let i = 0; i < NUMBER_OF_SETS; i++) {
      this.setAtShortIndex(SET_0_START_INDEX + i, 0);
    }

    this.setVirtualLength(virtualLength);
  }

  public clear() {
    this.byteArray.fill(0);
    this.init(this.virtualLength);
  }

  /** A context storing one 64 bit value per virtual index, for contents the packed representation cannot hold */
  static unpacked(virtualLength: number) {
    return new PackedArrayContext(
      virtualLength,
      MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH + 1
    );
  }

  /**
   * @return a context of the new virtual length holding the same values, or null if the packed
   * storage cannot hold them (the caller then moves to an unpacked context)
   */
  public copyAndIncreaseSize(
    newPhysicalArrayLength: number,
    newVirtualArrayLength: number
  ): PackedArrayContext | null {
    const ctx = new PackedArrayContext(
      newVirtualArrayLength,
      newPhysicalArrayLength
    );
    return ctx.populateEquivalentEntriesWithEntriesFromOther(this) ? ctx : null;
  }

  /** @return whether set 0 leaves cover two 8 index groups (16 bytes), so a group shares them */
  public hasWideSet0Leaves() {
    return this.leafLevelShiftBySet[0] === WIDE_SET_0_LEAF_LEVEL_SHIFT;
  }

  public getPopulatedShortLength() {
    return this.populatedShortLength;
  }

  public getPopulatedLongLength() {
    return (this.getPopulatedShortLength() + 3) >> 2; // round up
  }

  public setAtByteIndex(byteIndex: number, value: number) {
    this.byteArray[byteIndex] = value;
  }

  public getAtByteIndex(byteIndex: number) {
    return this.byteArray[byteIndex];
  }

  /**
   * add a byte value to a current byte value in the array
   * @param byteIndex index of byte value to add to
   * @param valueToAdd byte value to add
   * @return the afterAddValue. ((afterAddValue & 0x100) != 0) indicates a carry.
   */
  public addAtByteIndex(byteIndex: number, valueToAdd: number) {
    const newValue = this.byteArray[byteIndex] + valueToAdd;
    this.byteArray[byteIndex] = newValue;
    return newValue;
  }

  setPopulatedLongLength(newPopulatedLongLength: number) {
    this.populatedShortLength = newPopulatedLongLength << 2;
  }

  public getVirtualLength() {
    return this.virtualLength;
  }
  public length() {
    return this.physicalLength;
  }

  setAtShortIndex(shortIndex: number, value: number) {
    this.shortArray[shortIndex] = value;
  }

  setAtLongIndex(longIndex: number, value: number) {
    this.longArray[longIndex] = value;
  }

  getAtShortIndex(shortIndex: number) {
    return this.shortArray[shortIndex];
  }

  getIndexAtShortIndex(shortIndex: number) {
    return this.shortArray[shortIndex];
  }

  setPackedSlotIndicators(entryIndex: number, newPackedSlotIndicators: number) {
    this.setAtShortIndex(
      entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET,
      newPackedSlotIndicators
    );
  }

  getPackedSlotIndicators(entryIndex: number) {
    return (
      this.shortArray[entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET] &
      0xffff
    );
  }

  private getIndexAtEntrySlot(entryIndex: number, slot: number) {
    return this.getAtShortIndex(
      entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slot
    );
  }

  setIndexAtEntrySlot(entryIndex: number, slot: number, newIndexValue: number) {
    this.setAtShortIndex(
      entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slot,
      newIndexValue
    );
  }

  /**
   * @return false when the array is full: it cannot grow beyond
   * MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH (the Java version throws a ResizeException)
   */
  private expandArrayIfNeeded(entryLengthInLongs: number): boolean {
    const currentLength = this.length();
    if (currentLength < this.getPopulatedLongLength() + entryLengthInLongs) {
      const growthIncrement = max(
        entryLengthInLongs,
        PACKED_ARRAY_GROWTH_INCREMENT,
        this.getPopulatedLongLength() >> PACKED_ARRAY_GROWTH_FRACTION_POW2
      );
      const newLength = currentLength + growthIncrement;
      if (newLength > MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH) {
        return false;
      }
      this.resizeArray(newLength);
    }
    return true;
  }

  /** @return the short index of the new entry, or -1 if the array is full */
  private newEntry(entryLengthInShorts: number) {
    // Add entry at the end of the array:

    const newEntryIndex = this.populatedShortLength;
    if (!this.expandArrayIfNeeded((entryLengthInShorts >> 2) + 1)) {
      return -1;
    }
    this.populatedShortLength = newEntryIndex + entryLengthInShorts;

    for (let i = 0; i < entryLengthInShorts; i++) {
      this.setAtShortIndex(newEntryIndex + i, -1); // Poison value -1. Must be overriden before reads
    }
    return newEntryIndex;
  }

  /**
   * @param lengthInLongs the length of the leaf, 1 for an 8 byte leaf
   * @return the long index of the new leaf, or -1 if the array is full
   */
  private newLeafEntry(lengthInLongs: number) {
    // Add entry at the end of the array:
    const newEntryIndex = this.getPopulatedLongLength();
    if (!this.expandArrayIfNeeded(lengthInLongs)) {
      return -1;
    }

    this.setPopulatedLongLength(newEntryIndex + lengthInLongs);

    for (let i = 0; i < lengthInLongs; i++) {
      this.setAtLongIndex(newEntryIndex + i, 0);
    }

    return newEntryIndex;
  }

  /**
   * Consolidate entry with previous entry verison if one exists
   *
   * @param entryIndex The shortIndex of the entry to be consolidated
   * @param previousVersionIndex the index of the previous version of the entry
   */
  private consolidateEntry(entryIndex: number, previousVersionIndex: number) {
    const previousVersionPackedSlotsIndicators =
      this.getPackedSlotIndicators(previousVersionIndex);
    // Previous version exists, needs consolidation

    const packedSlotsIndicators = this.getPackedSlotIndicators(entryIndex);

    const insertedSlotMask =
      packedSlotsIndicators ^ previousVersionPackedSlotsIndicators; // the only bit that differs
    const slotsBelowBitNumber = packedSlotsIndicators & (insertedSlotMask - 1);
    const insertedSlotIndex = bitCount(slotsBelowBitNumber);
    const numberOfSlotsInEntry = bitCount(packedSlotsIndicators);

    // Copy the entry slots from previous version, skipping the newly inserted slot in the target:
    let sourceSlot = 0;
    for (let targetSlot = 0; targetSlot < numberOfSlotsInEntry; targetSlot++) {
      if (targetSlot !== insertedSlotIndex) {
        const indexAtSlot = this.getIndexAtEntrySlot(
          previousVersionIndex,
          sourceSlot
        );
        if (indexAtSlot !== 0) {
          this.setIndexAtEntrySlot(entryIndex, targetSlot, indexAtSlot);
        }
        sourceSlot++;
      }
    }
  }

  /**
   * Expand entry as indicated.
   *
   * @param existingEntryIndex the index of the entry
   * @param entryPointerIndex  index to the slot pointing to the entry (needs to be fixed up)
   * @param insertedSlotIndex  realtive [packed] index of slot being inserted into entry
   * @param insertedSlotMask   mask value fo slot being inserted
   * @param nextLevelIsLeaf    the level below this one is a leaf level
   * @param leafLengthInLongs  the length of the leaves, when the level below is a leaf level
   * @return the updated index of the entry, or -1 if the array is full (the entry is then left untouched)
   */
  expandEntry(
    existingEntryIndex: number,
    entryPointerIndex: number,
    insertedSlotIndex: number,
    insertedSlotMask: number,
    nextLevelIsLeaf: boolean,
    leafLengthInLongs: number
  ): number {
    let packedSlotIndicators =
      this.getAtShortIndex(existingEntryIndex) & 0xffff;
    packedSlotIndicators |= insertedSlotMask;
    const numberOfslotsInExpandedEntry = bitCount(packedSlotIndicators);

    if (insertedSlotIndex >= numberOfslotsInExpandedEntry) {
      throw new Error(
        "inserted slot index is out of range given provided masks"
      );
    }

    const expandedEntryLength =
      numberOfslotsInExpandedEntry + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS;

    // Create new next-level entry to refer to from slot at this level:
    let indexOfNewNextLevelEntry = 0;
    if (nextLevelIsLeaf) {
      indexOfNewNextLevelEntry = this.newLeafEntry(leafLengthInLongs); // Establish long-index to new leaf entry
      if (indexOfNewNextLevelEntry < 0) {
        return -1;
      }
    } else {
      // TODO: Optimize this by creating the whole sub-tree here, rather than a step that will immediaterly expand

      // Create a new 1 word (empty, no slots set) entry for the next level:
      indexOfNewNextLevelEntry = this.newEntry(
        NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS
      ); // Establish short-index to new leaf entry
      if (indexOfNewNextLevelEntry < 0) {
        return -1;
      }

      this.setPackedSlotIndicators(indexOfNewNextLevelEntry, 0);
    }

    const insertedSlotValue = indexOfNewNextLevelEntry;

    const expandedEntryIndex = this.newEntry(expandedEntryLength);
    if (expandedEntryIndex < 0) {
      return -1;
    }

    // populate the packed indicators word:
    this.setPackedSlotIndicators(expandedEntryIndex, packedSlotIndicators);

    // Populate the inserted slot with the index of the new next level entry:
    this.setIndexAtEntrySlot(
      expandedEntryIndex,
      insertedSlotIndex,
      insertedSlotValue
    );

    this.setAtShortIndex(entryPointerIndex, expandedEntryIndex);
    this.consolidateEntry(expandedEntryIndex, existingEntryIndex);

    return expandedEntryIndex;
  }

  //
  //   ######   ######## ########    ##     ##    ###    ##             ## #### ##    ## ########  ######## ##     ##
  //  ##    ##  ##          ##       ##     ##   ## ##   ##            ##   ##  ###   ## ##     ## ##        ##   ##
  //  ##        ##          ##       ##     ##  ##   ##  ##           ##    ##  ####  ## ##     ## ##         ## ##
  //  ##   #### ######      ##       ##     ## ##     ## ##          ##     ##  ## ## ## ##     ## ######      ###
  //  ##    ##  ##          ##        ##   ##  ######### ##         ##      ##  ##  #### ##     ## ##         ## ##
  //  ##    ##  ##          ##         ## ##   ##     ## ##        ##       ##  ##   ### ##     ## ##        ##   ##
  //   ######   ########    ##          ###    ##     ## ######## ##       #### ##    ## ########  ######## ##     ##
  //

  getRootEntry(setNumber: number, insertAsNeeded: boolean = false) {
    const entryPointerIndex = SET_0_START_INDEX + setNumber;
    let entryIndex = this.getIndexAtShortIndex(entryPointerIndex);

    if (entryIndex == 0) {
      if (!insertAsNeeded) {
        return 0; // Index does not currently exist in packed array;
      }

      entryIndex = this.newEntry(NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS);
      if (entryIndex < 0) {
        return 0; // The array is full, the index cannot be added
      }
      // Create a new empty (no slots set) entry for the next level:
      this.setPackedSlotIndicators(entryIndex, 0);

      this.setAtShortIndex(entryPointerIndex, entryIndex);
    }
    return entryIndex;
  }

  /**
   * Get the byte-index (into the packed array) corresponding to a given (set tree) value byte of given virtual index.
   * Inserts new set tree nodes as needed if indicated.
   *
   * @param setNumber      The set tree number (0-7, 0 corresponding with the LSByte set tree)
   * @param virtualIndex   The virtual index into the PackedArray
   * @param insertAsNeeded If true, will insert new set tree nodes as needed if they do not already exist
   * @return the byte-index corresponding to the given (set tree) value byte of the given virtual index,
   * or -1 if it does not exist and could not be inserted (either not asked to, or the array is full:
   * the caller then has to move to an unpacked context, see {@link PackedArray})
   */
  getPackedIndex(
    setNumber: number,
    virtualIndex: number,
    insertAsNeeded: boolean
  ) {
    if (virtualIndex >= this.virtualLength) {
      throw new Error(
        `Attempting access at index ${virtualIndex}, beyond virtualLength ${this.virtualLength}`
      );
    }

    let entryPointerIndex = SET_0_START_INDEX + setNumber; // TODO init needed ?
    let entryIndex = this.getRootEntry(setNumber, insertAsNeeded);
    if (entryIndex == 0) {
      return -1; // Index does not currently exist in packed array;
    }

    // Work down the levels of non-leaf entries:
    const leafLevelShift = this.leafLevelShiftBySet[setNumber];
    const leafLengthInLongs = this.leafLengthInLongsBySet[setNumber];
    for (
      let indexShift = this.topLevelShiftBySet[setNumber];
      indexShift >= leafLevelShift;
      indexShift -= 4
    ) {
      const nextLevelIsLeaf = indexShift === leafLevelShift;
      // Target is a packedSlotIndicators entry
      const packedSlotIndicators = this.getPackedSlotIndicators(entryIndex);
      const slotBitNumber = (virtualIndex >>> indexShift) & 0xf;
      const slotMask = 1 << slotBitNumber;
      const slotsBelowBitNumber = packedSlotIndicators & (slotMask - 1);
      const slotNumber = bitCount(slotsBelowBitNumber);

      if ((packedSlotIndicators & slotMask) === 0) {
        // The entryIndex slot does not have the contents we want
        if (!insertAsNeeded) {
          return -1; // Index does not currently exist in packed array;
        }

        // Expand the entry, adding the index to new entry at the proper slot:
        entryIndex = this.expandEntry(
          entryIndex,
          entryPointerIndex,
          slotNumber,
          slotMask,
          nextLevelIsLeaf,
          leafLengthInLongs
        );
        if (entryIndex < 0) {
          return -1; // The array is full, the index cannot be added
        }
      }

      // Next level's entry pointer index is in the appropriate slot in in the entries array in this entry:
      entryPointerIndex =
        entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slotNumber;

      entryIndex = this.getIndexAtShortIndex(entryPointerIndex);
    }

    // entryIndex is the long-index of a leaf entry that contains the value byte for the given set

    // Byte index offset within leaf entry. The leaf entry is the long index
    const byteIndex =
      (entryIndex << 3) + (virtualIndex & this.leafByteMaskBySet[setNumber]);
    return byteIndex;
  }

  /**
   * Lowest virtual index >= fromIndex whose group of indexes (the ones sharing
   * a set-0 leaf) has a leaf in set 0, i.e. whose values may be non-zero. Groups without a leaf are all
   * zeros and are skipped by descending only into the populated slots of
   * the set-0 tree, so the walk costs time proportional to the populated
   * groups rather than to the virtual length.
   *
   * Sets are populated in order 0..7 (see PackedArray set/add), so a group
   * with a leaf in any set has one in set 0: the set-0 tree covers every
   * group that may hold a non-zero value. The converse does not hold (a leaf
   * may be all zeros, or hold a byte 0 of 0 under a non-zero byte 1), so the
   * caller still has to read the values of the group returned.
   *
   * @return the index, which may exceed the virtual length when the last
   * group is partial, or -1 when no group at or after fromIndex has a leaf
   */
  nextIndexWithLeaf(fromIndex: number): number {
    if (fromIndex >= this.virtualLength) {
      return -1;
    }
    const rootEntryIndex = this.getIndexAtShortIndex(SET_0_START_INDEX);
    if (rootEntryIndex === 0) {
      return -1; // Set 0 has no tree at all: nothing was ever stored
    }
    return this.nextIndexWithLeafBelow(
      rootEntryIndex,
      this.topLevelShiftBySet[0],
      fromIndex
    );
  }

  /**
   * Walk the entry at entryIndex, which decodes the 4 index bits above
   * indexShift, for the lowest index >= fromIndex with a leaf below it.
   * fromIndex lies in the index range covered by the entry.
   */
  private nextIndexWithLeafBelow(
    entryIndex: number,
    indexShift: number,
    fromIndex: number
  ): number {
    const packedSlotIndicators = this.getPackedSlotIndicators(entryIndex);
    // The indexes covered by this entry share the bits above the ones its slots decode
    const entryBase = fromIndex & ~((1 << (indexShift + 4)) - 1);
    const nextLevelIsLeaf = indexShift === this.leafLevelShiftBySet[0];
    for (
      let slotBitNumber = (fromIndex >>> indexShift) & 0xf;
      slotBitNumber < 16;
      slotBitNumber++
    ) {
      const slotMask = 1 << slotBitNumber;
      if ((packedSlotIndicators & slotMask) === 0) {
        continue; // nothing was ever stored under this slot
      }
      const slotStart = entryBase | (slotBitNumber << indexShift);
      // Past the slot holding fromIndex, resume from the start of each slot
      const from = slotStart > fromIndex ? slotStart : fromIndex;
      if (nextLevelIsLeaf) {
        return from;
      }
      const slotNumber = bitCount32(packedSlotIndicators & (slotMask - 1));
      const nextLevelEntryIndex = this.getIndexAtShortIndex(
        entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slotNumber
      );
      const found = this.nextIndexWithLeafBelow(
        nextLevelEntryIndex,
        indexShift - 4,
        from
      );
      if (found >= 0) {
        return found;
      }
    }
    return -1;
  }

  /**
   * The top level shift of the set tree of the given set, for a virtual length: the levels of
   * non-leaf entries are at shifts leafLevelShift, leafLevelShift + 4, ..., top, and the top
   * level must cover the most significant bit of the virtual length, with at least two levels.
   */
  determineTopLevelShiftForVirtualLength(
    virtualLength: number,
    setNumber: number = 1
  ) {
    const leafLevelShift = leafLevelShiftFor(setNumber, virtualLength);
    const sizeMagnitude = ceil(log2(virtualLength));
    const levelsAboveTheFirst = max(
      ceil((sizeMagnitude - leafLevelShift - 4) / 4),
      1
    );
    return leafLevelShift + 4 * levelsAboveTheFirst;
  }

  setVirtualLength(virtualLength: number) {
    if (!this.isPacked) {
      throw new Error(
        "Should never be adjusting the virtual size of a non-packed context"
      );
    }
    for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
      const leafLevelShift = leafLevelShiftFor(setNumber, virtualLength);
      this.leafLevelShiftBySet[setNumber] = leafLevelShift;
      this.leafByteMaskBySet[setNumber] = (1 << leafLevelShift) - 1;
      this.leafLengthInLongsBySet[setNumber] =
        1 << (leafLevelShift - LEAF_LEVEL_SHIFT);
      this.topLevelShiftBySet[setNumber] =
        this.determineTopLevelShiftForVirtualLength(virtualLength, setNumber);
    }
    this.virtualLength = virtualLength;
  }

  /** @return whether the set trees of this context are laid out for the given virtual length */
  hasLayoutFor(virtualLength: number) {
    for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
      if (
        leafLevelShiftFor(setNumber, virtualLength) !==
          this.leafLevelShiftBySet[setNumber] ||
        this.determineTopLevelShiftForVirtualLength(
          virtualLength,
          setNumber
        ) !== this.topLevelShiftBySet[setNumber]
      ) {
        return false;
      }
    }
    return true;
  }

  //
  //  ##     ##         ########   #######  ########  ##     ## ##          ###    ######## ########
  //   ##   ##          ##     ## ##     ## ##     ## ##     ## ##         ## ##      ##    ##
  //    ## ##           ##     ## ##     ## ##     ## ##     ## ##        ##   ##     ##    ##
  //     ###    ####### ########  ##     ## ########  ##     ## ##       ##     ##    ##    ######
  //    ## ##           ##        ##     ## ##        ##     ## ##       #########    ##    ##
  //   ##   ##          ##        ##     ## ##        ##     ## ##       ##     ##    ##    ##
  //  ##     ##         ##         #######  ##         #######  ######## ##     ##    ##    ########
  //

  public resizeArray(newLength: number) {
    const tmp = new Uint8Array(newLength * 8);
    tmp.set(this.byteArray);
    this.array = tmp.buffer;
    this.initArrayViews(this.array);
    this.physicalLength = newLength;
  }

  /** @return false if the packed storage runs out while copying */
  private populateEquivalentEntriesWithEntriesFromOther(
    other: PackedArrayContext
  ): boolean {
    if (this.virtualLength < other.getVirtualLength()) {
      throw new Error("Cannot populate array of smaller virtual length");
    }

    for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
      if (
        setNumber === 0 &&
        this.leafLevelShiftBySet[0] !== other.leafLevelShiftBySet[0]
      ) {
        // The leaves of set 0 have another width: their layout cannot be copied as is
        if (!this.copySet0ValuesFromOther(other)) {
          return false;
        }
        continue;
      }
      const otherEntryIndex = other.getAtShortIndex(
        SET_0_START_INDEX + setNumber
      );
      if (otherEntryIndex == 0) continue; // No tree to duplicate
      let entryIndexPointer = SET_0_START_INDEX + setNumber;
      const otherTopLevelShift = other.topLevelShiftBySet[setNumber];
      for (
        let i = this.topLevelShiftBySet[setNumber];
        i > otherTopLevelShift;
        i -= 4
      ) {
        // for each inserted level:
        // Allocate entry in other:
        const sizeOfEntry = NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + 1;
        const newEntryIndex = this.newEntry(sizeOfEntry);

        // Link new level in.
        this.setAtShortIndex(entryIndexPointer, newEntryIndex);
        // Populate new level entry, use pointer to slot 0 as place to populate under:
        this.setPackedSlotIndicators(newEntryIndex, 0x1); // Slot 0 populated
        entryIndexPointer =
          newEntryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS; // Where the slot 0 index goes.
      }
      this.copyEntriesAtLevelFromOther(
        other,
        otherEntryIndex,
        entryIndexPointer,
        otherTopLevelShift,
        setNumber
      );
    }
    return true;
  }

  /**
   * Copies set 0 of other, one virtual index at a time: for a set 0 whose leaves have another
   * width the trees are not aligned, so the layout cannot be copied. A leaf is created wherever
   * other has one, zero byte or not: get() stops at the first set without a leaf, so the higher
   * sets must only be present where set 0 is.
   * @return false if the packed storage runs out
   */
  private copySet0ValuesFromOther(other: PackedArrayContext): boolean {
    for (
      let virtualIndex = 0;
      virtualIndex < other.virtualLength;
      virtualIndex++
    ) {
      const otherByteIndex = other.getPackedIndex(0, virtualIndex, false);
      if (otherByteIndex < 0) {
        continue;
      }
      const byteIndex = this.getPackedIndex(0, virtualIndex, true);
      if (byteIndex < 0) {
        return false;
      }
      this.setAtByteIndex(byteIndex, other.getAtByteIndex(otherByteIndex));
    }
    return true;
  }

  private copyEntriesAtLevelFromOther(
    other: PackedArrayContext,
    otherLevelEntryIndex: number,
    levelEntryIndexPointer: number,
    otherIndexShift: number,
    setNumber: number
  ) {
    const leafLevelShift = this.leafLevelShiftBySet[setNumber];
    const leafLengthInLongs = this.leafLengthInLongsBySet[setNumber];
    const nextLevelIsLeaf = otherIndexShift == leafLevelShift;
    const packedSlotIndicators =
      other.getPackedSlotIndicators(otherLevelEntryIndex);
    const numberOfSlots = bitCount(packedSlotIndicators);
    const sizeOfEntry = NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + numberOfSlots;
    const entryIndex = this.newEntry(sizeOfEntry);

    this.setAtShortIndex(levelEntryIndexPointer, entryIndex);
    this.setAtShortIndex(
      entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET,
      packedSlotIndicators
    );

    for (let i = 0; i < numberOfSlots; i++) {
      if (nextLevelIsLeaf) {
        // Make leaf in other:
        const leafEntryIndex = this.newLeafEntry(leafLengthInLongs);

        this.setIndexAtEntrySlot(entryIndex, i, leafEntryIndex);

        // OPTIM
        // avoid iteration on all the values of the source ctx
        const otherNextLevelEntryIndex = other.getIndexAtEntrySlot(
          otherLevelEntryIndex,
          i
        );
        for (let longNum = 0; longNum < leafLengthInLongs; longNum++) {
          this.longArray[leafEntryIndex + longNum] =
            other.longArray[otherNextLevelEntryIndex + longNum];
        }
      } else {
        const otherNextLevelEntryIndex = other.getIndexAtEntrySlot(
          otherLevelEntryIndex,
          i
        );
        this.copyEntriesAtLevelFromOther(
          other,
          otherNextLevelEntryIndex,
          entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + i,
          otherIndexShift - 4,
          setNumber
        );
      }
    }
  }

  getAtUnpackedIndex(index: number) {
    return this.longArray[index];
  }

  setAtUnpackedIndex(index: number, newValue: number) {
    this.longArray[index] = newValue;
  }

  lazysetAtUnpackedIndex(index: number, newValue: number) {
    this.longArray[index] = newValue;
  }

  incrementAndGetAtUnpackedIndex(index: number) {
    this.longArray[index]++;
    return this.longArray[index];
  }

  addAndGetAtUnpackedIndex(index: number, valueToAdd: number) {
    this.longArray[index] += valueToAdd;
    return this.longArray[index];
  }

  //
  //   ########  #######           ######  ######## ########  #### ##    ##  ######
  //      ##    ##     ##         ##    ##    ##    ##     ##  ##  ###   ## ##    ##
  //      ##    ##     ##         ##          ##    ##     ##  ##  ####  ## ##
  //      ##    ##     ## #######  ######     ##    ########   ##  ## ## ## ##   ####
  //      ##    ##     ##               ##    ##    ##   ##    ##  ##  #### ##    ##
  //      ##    ##     ##         ##    ##    ##    ##    ##   ##  ##   ### ##    ##
  //      ##     #######           ######     ##    ##     ## #### ##    ##  ######
  //

  private nonLeafEntryToString(
    entryIndex: number,
    indexShift: number,
    indentLevel: number,
    leafLevelShift: number
  ) {
    let output = "";
    for (let i = 0; i < indentLevel; i++) {
      output += "  ";
    }
    try {
      const packedSlotIndicators = this.getPackedSlotIndicators(entryIndex);
      output += `slotIndiators: 0x${toHex(
        packedSlotIndicators
      )}, prevVersionIndex: 0: [ `;

      const numberOfslotsInEntry = bitCount(packedSlotIndicators);
      for (let i = 0; i < numberOfslotsInEntry; i++) {
        output += this.getIndexAtEntrySlot(entryIndex, i);
        if (i < numberOfslotsInEntry - 1) {
          output += ", ";
        }
      }
      output += ` ] (indexShift = ${indexShift})\n`;
      const nextLevelIsLeaf = indexShift == leafLevelShift;
      for (let i = 0; i < numberOfslotsInEntry; i++) {
        const nextLevelEntryIndex = this.getIndexAtEntrySlot(entryIndex, i);
        if (nextLevelIsLeaf) {
          output += this.leafEntryToString(
            nextLevelEntryIndex,
            indentLevel + 4
          );
        } else {
          output += this.nonLeafEntryToString(
            nextLevelEntryIndex,
            indexShift - 4,
            indentLevel + 4,
            leafLevelShift
          );
        }
      }
    } catch (ex) {
      output += `Exception thrown at nonLeafEnty at index ${entryIndex} with indexShift ${indexShift}\n`;
    }
    return output;
  }

  private leafEntryToString(entryIndex: number, indentLevel: number) {
    let output = "";
    for (let i = 0; i < indentLevel; i++) {
      output += "  ";
    }
    try {
      output += "Leaf bytes : ";
      for (let i = 0; i < 8; i++) {
        output += `0x${toHex(this.byteArray[entryIndex * 8 + i])} `;
      }
      output += "\n";
    } catch (ex) {
      output += `Exception thrown at leafEnty at index ${entryIndex}\n`;
    }
    return output;
  }

  public toString() {
    let output = "PackedArrayContext:\n";
    if (!this.isPacked) {
      return output + "Context is unpacked:\n"; // unpackedToString();
    }
    for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
      try {
        const entryPointerIndex = SET_0_START_INDEX + setNumber;
        const entryIndex = this.getIndexAtShortIndex(entryPointerIndex);
        output += `Set ${setNumber}: root = ${entryIndex} \n`;
        if (entryIndex == 0) continue;
        output += this.nonLeafEntryToString(
          entryIndex,
          this.topLevelShiftBySet[setNumber],
          4,
          this.leafLevelShiftBySet[setNumber]
        );
      } catch (ex) {
        output += `Exception thrown in set ${setNumber}%d\n`;
      }
    }
    //output += recordedValuesToString();
    return output;
  }
}

const toHex = (n: number) => {
  return Number(n).toString(16).padStart(2, "0");
};
