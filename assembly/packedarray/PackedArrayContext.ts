/*
 * This is a AssemblyScript port of the original Java version, which was written by
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
 * may require a resizing of the array, it can throw a {@link ResizeError} to indicate that the requested
 * packed index cannot be found or added without a resize of the physical storage.
 *
 */
 export const MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY = 16;
 /**
  * A packed context addresses its entries with 16 bit indexes (Java shorts, hence
  * Short.MAX_VALUE / 4 longs). Beyond this physical length the context is unpacked:
  * one u64 per virtual index.
  */
 export const MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH: i32 = 8191;
 const SET_0_START_INDEX = 0;
 const NUMBER_OF_SETS = 8;
 // A leaf of a set covers the 2^leafLevelShift virtual indexes sharing their high bits.
 // Set 0 is the dense byte (most recorded values only use it), so its leaves are 16 bytes wide:
 // the set tree is one level shallower for some virtual lengths. The other sets keep 8 bytes,
 // as a populated leaf costs its whole width.
 const LEAF_LEVEL_SHIFT: i32 = 3;
 const SET_0_LEAF_LEVEL_SHIFT: i32 = 4;
 export const LEAF_LEVEL_SHIFT_BY_SET: StaticArray<i32> = [
   SET_0_LEAF_LEVEL_SHIFT,
   LEAF_LEVEL_SHIFT,
   LEAF_LEVEL_SHIFT,
   LEAF_LEVEL_SHIFT,
   LEAF_LEVEL_SHIFT,
   LEAF_LEVEL_SHIFT,
   LEAF_LEVEL_SHIFT,
   LEAF_LEVEL_SHIFT
 ];
 // Mask of the virtual index bits selecting the byte within a leaf, per set
 export const LEAF_BYTE_MASK_BY_SET: StaticArray<i32> = [15, 7, 7, 7, 7, 7, 7, 7];
 // Length of a leaf in longs (8 bytes each), per set
 const LEAF_LENGTH_IN_LONGS_BY_SET: StaticArray<i32> = [2, 1, 1, 1, 1, 1, 1, 1];
 const NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET = 0;
 const NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS = <u16>1;
 const PACKED_ARRAY_GROWTH_INCREMENT = 16;
 const PACKED_ARRAY_GROWTH_FRACTION_POW2 = 4;
 
 export class PackedArrayContext {
   public readonly isPacked: boolean;
   physicalLength: i32;
 
   private array!: ArrayBuffer;
   private byteArray!: Uint8Array;
   private shortArray!: Uint16Array;
   private longArray!: Uint64Array;
   /**
    * Address of the first byte of `array`. The accessors on the set-tree walk
    * read and write through it directly, skipping the typed array bounds checks
    * (indexes come from the tree itself, which is kept within the array).
    */
   private dataStart: usize = 0;
   private populatedShortLength: i32 = 0;
   private virtualLength: i32;
   // Per set, make it non-sensical until properly initialized.
   private topLevelShiftBySet: StaticArray<i32> = new StaticArray<i32>(
     NUMBER_OF_SETS
   ).fill(i32.MAX_VALUE);
 
   constructor(virtualLength: i32, initialPhysicalLength: i32) {
     this.physicalLength = <i32>(
       Math.max(initialPhysicalLength, MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY)
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
 
   private initArrayViews(array: ArrayBuffer): void {
     this.byteArray = Uint8Array.wrap(array);
     this.shortArray = Uint16Array.wrap(array);
     this.longArray = Uint64Array.wrap(array);
     this.dataStart = changetype<usize>(array);
   }
 
   private init(virtualLength: i32): void {
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
 
   public clear(): void {
     this.byteArray.fill(0);
     this.init(this.virtualLength);
   }
 
   /** A context storing one u64 per virtual index, for contents the packed representation cannot hold */
   static unpacked(virtualLength: i32): PackedArrayContext {
     return new PackedArrayContext(
       virtualLength,
       MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH + 1
     );
   }

   public copyAndIncreaseSize(
     newPhysicalArrayLength: i32,
     newVirtualArrayLength: i32
   ): PackedArrayContext {
     const ctx = new PackedArrayContext(
       newVirtualArrayLength,
       newPhysicalArrayLength
     );
     ctx.populateEquivalentEntriesWithEntriesFromOther(this);
     return ctx;
   }
 
   public getPopulatedShortLength(): i32 {
     return this.populatedShortLength;
   }
 
   public getPopulatedLongLength(): i32 {
     return (this.getPopulatedShortLength() + 3) >> 2; // round up
   }
 
   @inline
   public setAtByteIndex(byteIndex: i32, value: u8): void {
     store<u8>(this.dataStart + <usize>byteIndex, value);
   }
 
   @inline
   public getAtByteIndex(byteIndex: i32): u8 {
     return load<u8>(this.dataStart + <usize>byteIndex);
   }
 
   /**
    * add a byte value to a current byte value in the array
    * @param byteIndex index of byte value to add to
    * @param valueToAdd byte value to add
    * @return the afterAddValue, unwrapped: (afterAddValue >> 8) is the carry.
    */
   @inline
   public addAtByteIndex(byteIndex: i32, valueToAdd: u8): u32 {
     const pointer = this.dataStart + <usize>byteIndex;
     const newValue = <u32>load<u8>(pointer) + <u32>valueToAdd;
     store<u8>(pointer, <u8>newValue);
     return newValue;
   }
 
   setPopulatedLongLength(newPopulatedLongLength: i32): void {
     this.populatedShortLength = newPopulatedLongLength << 2;
   }
 
   public getVirtualLength(): i32 {
     return this.virtualLength;
   }
   public length(): i32 {
     return this.physicalLength;
   }
 
   @inline
   setAtShortIndex(shortIndex: i32, value: u16): void {
     store<u16>(this.dataStart + (<usize>shortIndex << 1), value);
   }
 
   @inline
   setAtLongIndex(longIndex: i32, value: u64): void {
     store<u64>(this.dataStart + (<usize>longIndex << 3), value);
   }
 
   @inline
   getAtShortIndex(shortIndex: i32): u16 {
     return load<u16>(this.dataStart + (<usize>shortIndex << 1));
   }
 
   @inline
   getIndexAtShortIndex(shortIndex: i32): u16 {
     return load<u16>(this.dataStart + (<usize>shortIndex << 1));
   }
 
   setPackedSlotIndicators(entryIndex: i32, newPackedSlotIndicators: u16): void {
     this.setAtShortIndex(
       entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET,
       newPackedSlotIndicators
     );
   }
 
   @inline
   getPackedSlotIndicators(entryIndex: i32): u16 {
     return this.getAtShortIndex(
       entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET
     );
   }
 
   private getIndexAtEntrySlot(entryIndex: i32, slot: i32): u16 {
     return this.getAtShortIndex(
       entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slot
     );
   }
 
   setIndexAtEntrySlot(entryIndex: i32, slot: i32, newIndexValue: u16): void {
     this.setAtShortIndex(
       entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slot,
       newIndexValue
     );
   }
 
   /**
    * @return false when the array is full: it cannot grow beyond
    * MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH (the Java version throws a ResizeException)
    */
   private expandArrayIfNeeded(entryLengthInLongs: i32): bool {
     const currentLength = this.length();
     if (currentLength < this.getPopulatedLongLength() + entryLengthInLongs) {
       const growthIncrement = <i32>(
         max(
           max(entryLengthInLongs, PACKED_ARRAY_GROWTH_INCREMENT),
           this.getPopulatedLongLength() >> PACKED_ARRAY_GROWTH_FRACTION_POW2
         )
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
   private newEntry(entryLengthInShorts: i32): i32 {
     // Add entry at the end of the array:

     const newEntryIndex = this.populatedShortLength;
     if (!this.expandArrayIfNeeded((entryLengthInShorts >> 2) + 1)) {
       return -1;
     }
     this.populatedShortLength = newEntryIndex + entryLengthInShorts;
 
     for (let i = 0; i < entryLengthInShorts; i++) {
       this.setAtShortIndex(newEntryIndex + i, <u16>-1); // Poison value -1. Must be overriden before reads
     }
     return newEntryIndex;
   }
 
   /**
    * @param lengthInLongs the length of the leaf, 1 for an 8 byte leaf
    * @return the long index of the new leaf, or -1 if the array is full
    */
   private newLeafEntry(lengthInLongs: i32): i32 {
     // Add entry at the end of the array:
     let newEntryIndex = this.getPopulatedLongLength();
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
    * Consolidate entry with previous entry version if one exists
    *
    * @param entryIndex The shortIndex of the entry to be consolidated
    * @param previousVersionIndex the index of the previous version of the entry
    */
   private consolidateEntry(entryIndex: i32, previousVersionIndex: i32): void {
     const previousVersionPackedSlotsIndicators = this.getPackedSlotIndicators(
       previousVersionIndex
     );
     // Previous version exists, needs consolidation
 
     const packedSlotsIndicators = this.getPackedSlotIndicators(entryIndex);
 
     const insertedSlotMask =
       packedSlotsIndicators ^ previousVersionPackedSlotsIndicators; // the only bit that differs
     const slotsBelowBitNumber = packedSlotsIndicators & (insertedSlotMask - 1);
     const insertedSlotIndex = popcnt(slotsBelowBitNumber);
     const numberOfSlotsInEntry = popcnt(packedSlotsIndicators);
 
     // Copy the entry slots from previous version, skipping the newly inserted slot in the target:
     let sourceSlot = 0;
     for (
       let targetSlot: u8 = 0;
       targetSlot < numberOfSlotsInEntry;
       targetSlot++
     ) {
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
     existingEntryIndex: i32,
     entryPointerIndex: i32,
     insertedSlotIndex: i32,
     insertedSlotMask: i32,
     nextLevelIsLeaf: boolean,
     leafLengthInLongs: i32
   ): i32 {
     let packedSlotIndicators =
       (<i32>this.getAtShortIndex(existingEntryIndex)) & 0xffff;
     packedSlotIndicators |= insertedSlotMask;
     const numberOfslotsInExpandedEntry = popcnt(packedSlotIndicators);
 
     if (insertedSlotIndex >= <i32>numberOfslotsInExpandedEntry) {
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
     this.setPackedSlotIndicators(expandedEntryIndex, <u16>packedSlotIndicators);
 
     // Populate the inserted slot with the index of the new next level entry:
     this.setIndexAtEntrySlot(
       expandedEntryIndex,
       insertedSlotIndex,
       <u16>insertedSlotValue
     );
 
     this.setAtShortIndex(entryPointerIndex, <u16>expandedEntryIndex);
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
 
   getRootEntry(setNumber: i32, insertAsNeeded: boolean = false): i32 {
     const entryPointerIndex = SET_0_START_INDEX + setNumber;
     let entryIndex = <i32>this.getIndexAtShortIndex(entryPointerIndex);
 
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
 
       this.setAtShortIndex(entryPointerIndex, <u16>entryIndex);
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
     setNumber: i32,
     virtualIndex: i32,
     insertAsNeeded: boolean
   ): i32 {
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
     const leafLevelShift = LEAF_LEVEL_SHIFT_BY_SET[setNumber];
     const leafLengthInLongs = LEAF_LENGTH_IN_LONGS_BY_SET[setNumber];
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
       const slotNumber = popcnt(slotsBelowBitNumber);
 
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
 
     // Byte index offset within leaf entry, the leaf entry being the long index
     const byteIndex =
       (entryIndex << 3) + (virtualIndex & LEAF_BYTE_MASK_BY_SET[setNumber]);
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
   nextIndexWithLeaf(fromIndex: i32): i32 {
     if (fromIndex >= this.virtualLength) {
       return -1;
     }
     const rootEntryIndex = <i32>this.getIndexAtShortIndex(SET_0_START_INDEX);
     if (rootEntryIndex == 0) {
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
     entryIndex: i32,
     indexShift: i32,
     fromIndex: i32
   ): i32 {
     const packedSlotIndicators = <i32>this.getPackedSlotIndicators(entryIndex);
     // The indexes covered by this entry share the bits above the ones its slots decode
     const entryBase = fromIndex & ~((1 << (indexShift + 4)) - 1);
     const nextLevelIsLeaf = indexShift == LEAF_LEVEL_SHIFT_BY_SET[0];
     for (
       let slotBitNumber = (fromIndex >>> indexShift) & 0xf;
       slotBitNumber < 16;
       slotBitNumber++
     ) {
       const slotMask = 1 << slotBitNumber;
       if ((packedSlotIndicators & slotMask) == 0) {
         continue; // nothing was ever stored under this slot
       }
       const slotStart = entryBase | (slotBitNumber << indexShift);
       // Past the slot holding fromIndex, resume from the start of each slot
       const from = slotStart > fromIndex ? slotStart : fromIndex;
       if (nextLevelIsLeaf) {
         return from;
       }
       const slotNumber = popcnt(packedSlotIndicators & (slotMask - 1));
       const nextLevelEntryIndex = <i32>(
         this.getIndexAtShortIndex(
           entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slotNumber
         )
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
     virtualLength: i32,
     setNumber: i32 = 1
   ): i32 {
     const leafLevelShift = LEAF_LEVEL_SHIFT_BY_SET[setNumber];
     const sizeMagnitude = <i32>ceil(Math.log2(virtualLength));
     const levelsAboveTheFirst = max(
       <i32>ceil(<f64>(sizeMagnitude - leafLevelShift - 4) / 4.0),
       1
     );
     return leafLevelShift + 4 * levelsAboveTheFirst;
   }

   /** @return whether the set trees of this context are laid out for the given virtual length */
   hasTopLevelShiftsFor(virtualLength: i32): boolean {
     for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
       if (
         this.determineTopLevelShiftForVirtualLength(virtualLength, setNumber) !==
         this.topLevelShiftBySet[setNumber]
       ) {
         return false;
       }
     }
     return true;
   }
 
   setVirtualLength(virtualLength: i32): void {
     if (!this.isPacked) {
       throw new Error(
         "Should never be adjusting the virtual size of a non-packed context"
       );
     }
     for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
       this.topLevelShiftBySet[setNumber] = this.determineTopLevelShiftForVirtualLength(
         virtualLength,
         setNumber
       );
     }
     this.virtualLength = virtualLength;
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
 
   public resizeArray(newLength: i32): void {
     const tmp = new Uint8Array(newLength * 8);
     tmp.set(this.byteArray);
     this.array = tmp.buffer;
     this.initArrayViews(this.array);
     this.physicalLength = newLength;
   }
 
   private populateEquivalentEntriesWithEntriesFromOther(
     other: PackedArrayContext
   ): void {
     if (this.virtualLength < other.getVirtualLength()) {
       throw new Error("Cannot populate array of smaller virtual length");
     }
 
     for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
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
         this.setAtShortIndex(entryIndexPointer, <u16>newEntryIndex);
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
   }
 
   private copyEntriesAtLevelFromOther(
     other: PackedArrayContext,
     otherLevelEntryIndex: i32,
     levelEntryIndexPointer: i32,
     otherIndexShift: i32,
     setNumber: i32
   ): void {
     const leafLevelShift = LEAF_LEVEL_SHIFT_BY_SET[setNumber];
     const leafLengthInLongs = LEAF_LENGTH_IN_LONGS_BY_SET[setNumber];
     const nextLevelIsLeaf = otherIndexShift == leafLevelShift;
     const packedSlotIndicators = other.getPackedSlotIndicators(
       otherLevelEntryIndex
     );
     const numberOfSlots = popcnt(packedSlotIndicators);
     const sizeOfEntry = NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + numberOfSlots;
     const entryIndex = this.newEntry(sizeOfEntry);
 
     this.setAtShortIndex(levelEntryIndexPointer, <u16>entryIndex);
     this.setAtShortIndex(
       entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET,
       packedSlotIndicators
     );
 
     for (let i: u8 = 0; i < numberOfSlots; i++) {
       if (nextLevelIsLeaf) {
         // Make leaf in other:
         const leafEntryIndex = this.newLeafEntry(leafLengthInLongs);
 
         this.setIndexAtEntrySlot(entryIndex, i, <u16>leafEntryIndex);
 
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
 
   @inline
   getAtUnpackedIndex(index: i32): u64 {
     return this.longArray[index];
   }
 
   @inline
   setAtUnpackedIndex(index: i32, newValue: u64): void {
     this.longArray[index] = newValue;
   }
 
   lazysetAtUnpackedIndex(index: i32, newValue: u64): void {
     this.longArray[index] = newValue;
   }
 
   incrementAndGetAtUnpackedIndex(index: i32): u64 {
     return this.addAndGetAtUnpackedIndex(index, 1);
   }
 
   addAndGetAtUnpackedIndex(index: i32, valueToAdd: u64): u64 {
     const newValue = this.longArray[index] + valueToAdd;
     this.longArray[index] = newValue;
     return newValue;
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
     entryIndex: i32,
     indexShift: i32,
     indentLevel: i32,
     leafLevelShift: i32
   ): string {
     let output = "";
     for (let i = 0; i < indentLevel; i++) {
       output += "  ";
     }
     const packedSlotIndicators = this.getPackedSlotIndicators(entryIndex);
     output +=
       "slotIndiators: 0x" +
       toHex(packedSlotIndicators) +
       ", prevVersionIndex: 0: [ ";
 
     const numberOfslotsInEntry = popcnt(packedSlotIndicators);
     for (let i: u8 = 0; i < numberOfslotsInEntry; i++) {
       output += this.getIndexAtEntrySlot(entryIndex, i).toString();
       if (i < numberOfslotsInEntry - 1) {
         output += ", ";
       }
     }
     output += " ] (indexShift = " + indexShift.toString() + ")\n";
     const nextLevelIsLeaf = indexShift == leafLevelShift;
     for (let i: u8 = 0; i < numberOfslotsInEntry; i++) {
       const nextLevelEntryIndex = this.getIndexAtEntrySlot(entryIndex, i);
       if (nextLevelIsLeaf) {
         output += this.leafEntryToString(
           nextLevelEntryIndex,
           indentLevel + 4,
           leafLevelShift
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
 
     return output;
   }
 
   private leafEntryToString(
     entryIndex: i32,
     indentLevel: i32,
     leafLevelShift: i32
   ): string {
     let output = "";
     for (let i = 0; i < indentLevel; i++) {
       output += "  ";
     }

     output += "Leaf bytes : ";
     // 16 bytes for a set 0 leaf, 8 for the other sets
     const leafLengthInBytes = 1 << leafLevelShift;
     for (let i = 0; i < leafLengthInBytes; i++) {
       output += "0x" + toHex(this.byteArray[entryIndex * 8 + i]) + " ";
     }
     output += "\n";
 
     return output;
   }
 
   public toString(): string {
     let output = "PackedArrayContext:\n";
     if (!this.isPacked) {
       return output + "Context is unpacked:\n"; // unpackedToString();
     }
     for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
       const entryPointerIndex = SET_0_START_INDEX + setNumber;
       const entryIndex = this.getIndexAtShortIndex(entryPointerIndex);
       output +=
         "Set " +
         setNumber.toString() +
         ": root = " +
         entryIndex.toString() +
         " \n";
       if (entryIndex == 0) continue;
       output += this.nonLeafEntryToString(
          entryIndex,
          this.topLevelShiftBySet[setNumber],
          4,
          LEAF_LEVEL_SHIFT_BY_SET[setNumber]
        );
     }
     //output += recordedValuesToString();
     return output;
   }
 }
 
 const hexaCode = [
   "0",
   "1",
   "2",
   "3",
   "4",
   "5",
   "6",
   "7",
   "8",
   "9",
   "a",
   "b",
   "c",
   "d",
   "e",
   "f",
 ];
 
 export function toHex(n: u64): string {
   let i = n;
   let result = "";
   do {
     const current = <i32>(i & 0xf);
     result = hexaCode[current] + result;
     i = i >> 4;
   } while (i > 0);
 
   return result.padStart(2, "0");
 }
 