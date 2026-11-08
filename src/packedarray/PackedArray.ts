/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import {
  PackedArrayContext,
  MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY
} from "./PackedArrayContext";

const NUMBER_OF_SETS = 8;
const NO_LEAF = -1;
const { floor } = Math;
// 256^byteNum, the weight of each set's byte in a 64 bit value
const BYTE_WEIGHTS = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => 256 ** n);

/**
 * A Packed array of signed 64 bit values, and supports {@link #get get()}, {@link #set set()},
 * {@link #add add()} and {@link #increment increment()} operations on the logical contents of the array.
 *
 * An {@link PackedLongArray} Uses {@link PackedArrayContext} to track
 * the array's logical contents. Contexts may be switched when a context requires resizing
 * to complete logical array operations (get, set, add, increment). Contexts are
 * established and used within critical sections in order to facilitate concurrent
 * implementors.
 *
 */
export class PackedArray {
  private arrayContext: PackedArrayContext;

  // Leaf cache for sequential reads.
  //
  // The 8 virtual indexes of a group (index >> 3) share one leaf per byte set,
  // so a scan over consecutive indexes would otherwise repeat the same set-tree
  // walks 8 times. leafIndexBySet remembers, for the group last read, the long
  // index of each set's leaf (NO_LEAF when the set has no entry for that
  // group). set() and add() record the leaves they insert for the cached group,
  // and anything that rebuilds the context invalidates the cache.
  private cachedGroup = -1;
  private leafIndexBySet: number[] = new Array(NUMBER_OF_SETS).fill(NO_LEAF);

  constructor(
    virtualLength: number,
    initialPhysicalLength: number = MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY
  ) {
    this.arrayContext = new PackedArrayContext(
      virtualLength,
      initialPhysicalLength
    );
  }

  public setVirtualLength(newVirtualArrayLength: number) {
    this.cachedGroup = -1;
    if (newVirtualArrayLength < this.length()) {
      throw new Error(
        "Cannot set virtual length, as requested length " +
          newVirtualArrayLength +
          " is smaller than the current virtual length " +
          this.length()
      );
    }
    const currentArrayContext = this.arrayContext;
    if (!currentArrayContext.isPacked) {
      this.unpack(newVirtualArrayLength);
      return;
    }
    if (
      currentArrayContext.determineTopLevelShiftForVirtualLength(
        newVirtualArrayLength
      ) == currentArrayContext.getTopLevelShift()
    ) {
      // No changes to the array context contents is needed. Just change the virtual length.
      currentArrayContext.setVirtualLength(newVirtualArrayLength);
      return;
    }
    this.arrayContext = currentArrayContext.copyAndIncreaseSize(
      this.getPhysicalLength(),
      newVirtualArrayLength
    );
  }

  /**
   * Get value at virtual index in the array
   * @param index the virtual array index
   * @return the array value at the virtual index given
   */
  get(index: number) {
    const arrayContext = this.arrayContext;
    // Deal with unpacked context:
    if (!arrayContext.isPacked) {
      return arrayContext.getAtUnpackedIndex(index);
    }
    // Context is packed:
    const group = floor(index / 8);
    if (group !== this.cachedGroup) {
      this.fillLeafCache(index, group);
    }
    const byteInLeaf = index & 0x7;
    const leafIndexBySet = this.leafIndexBySet;
    let value = 0;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      const leafIndex = leafIndexBySet[byteNum];
      if (leafIndex === NO_LEAF) {
        break;
      }
      value +=
        arrayContext.getAtByteIndex(leafIndex * 8 + byteInLeaf) *
        BYTE_WEIGHTS[byteNum];
    }
    return value;
  }

  /**
   * Walk the set trees once for the group of 8 indexes containing `index`, and
   * remember the leaf of every set that has one.
   */
  private fillLeafCache(index: number, group: number) {
    const arrayContext = this.arrayContext;
    const leafIndexBySet = this.leafIndexBySet;
    let byteNum = 0;
    for (; byteNum < NUMBER_OF_SETS; byteNum++) {
      const packedIndex = arrayContext.getPackedIndex(byteNum, index, false);
      if (packedIndex < 0) {
        break;
      }
      leafIndexBySet[byteNum] = packedIndex >> 3;
    }
    // Sets are populated from byte 0 upwards (see set() and add()), so once a
    // set has no leaf for this group the higher sets have none either.
    for (; byteNum < NUMBER_OF_SETS; byteNum++) {
      leafIndexBySet[byteNum] = NO_LEAF;
    }
    this.cachedGroup = group;
  }

  /** Keep the leaf cache coherent with a leaf just looked up with insertAsNeeded. */
  private noteLeaf(index: number, byteNum: number, packedIndex: number) {
    if (floor(index / 8) === this.cachedGroup) {
      this.leafIndexBySet[byteNum] = packedIndex >> 3;
    }
  }

  /**
   * Increment value at a virrual index in the array
   * @param index virtual index of value to increment
   */
  public increment(index: number) {
    this.add(index, 1);
  }

  private safeGetPackedIndexgetPackedIndex(
    setNumber: number,
    virtualIndex: number
  ) {
    return this.arrayContext.getPackedIndex(setNumber, virtualIndex, true);
  }

  /**
   * Add to a value at a virtual index in the array
   * @param index the virtual index of the value to be added to
   * @param value the value to add
   */
  public add(index: number, value: number) {
    const arrayContext = this.arrayContext;
    // Deal with unpacked context:
    if (!arrayContext.isPacked) {
      arrayContext.addAndGetAtUnpackedIndex(index, value);
      return;
    }
    // Context is packed:
    let remainingValueToAdd = value;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      const packedIndex = this.safeGetPackedIndexgetPackedIndex(byteNum, index);
      if (packedIndex < 0) {
        // The packed storage is full, the lower bytes have already been added
        this.unpack();
        this.arrayContext.addAndGetAtUnpackedIndex(
          index,
          remainingValueToAdd * BYTE_WEIGHTS[byteNum]
        );
        return;
      }
      this.noteLeaf(index, byteNum, packedIndex);

      // The low byte survives the int32 conversion, even above 2^32
      const byteToAdd = remainingValueToAdd & 0xff;
      const afterAddByteValue = arrayContext.addAtByteIndex(
        packedIndex,
        byteToAdd
      );

      // Move on to the next byte, accounting for the carry:
      remainingValueToAdd =
        floor(remainingValueToAdd / 256) + (afterAddByteValue >> 8);

      if (remainingValueToAdd === 0) {
        return; // nothing to add to higher magnitudes
      }
    }
  }

  /**
   * Set the value at a virtual index in the array
   * @param index the virtual index of the value to set
   * @param value the value to set
   */
  set(index: number, value: number) {
    const arrayContext = this.arrayContext;
    // Deal with unpacked context:
    if (!arrayContext.isPacked) {
      arrayContext.setAtUnpackedIndex(index, value);
      return;
    }
    // Context is packed:
    let valueForNextLevels = value;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      if (valueForNextLevels === 0) {
        // Special-case zeros to avoid inflating packed array for no reason
        const packedIndex = arrayContext.getPackedIndex(byteNum, index, false);
        if (packedIndex < 0) {
          return; // no need to create entries for zero values if they don't already exist
        }
      }
      // Make sure byte is populated:
      const packedIndex = arrayContext.getPackedIndex(byteNum, index, true);
      if (packedIndex < 0) {
        // The packed storage is full
        this.unpack();
        this.arrayContext.setAtUnpackedIndex(index, value);
        return;
      }
      this.noteLeaf(index, byteNum, packedIndex);

      // Determine value to write, and prepare for next levels
      const byteToWrite = valueForNextLevels & 0xff;
      valueForNextLevels = floor(valueForNextLevels / 256);

      arrayContext.setAtByteIndex(packedIndex, byteToWrite);
    }
  }

  /**
   * Move the contents to a new unpacked context of the given virtual length,
   * once the packed representation cannot grow any further
   */
  private unpack(virtualLength: number = this.length()) {
    const unpacked = PackedArrayContext.unpacked(virtualLength);
    for (let index = 0; index < this.length(); index++) {
      unpacked.setAtUnpackedIndex(index, this.get(index));
    }
    this.arrayContext = unpacked;
  }

  /**
   * Get the current physical length (in longs) of the array's backing storage
   * @return the current physical length (in longs) of the array's current backing storage
   */
  getPhysicalLength() {
    return this.arrayContext.physicalLength;
  }

  /**
   * Get the (virtual) length of the array
   * @return the (virtual) length of the array
   */
  length() {
    return this.arrayContext.getVirtualLength();
  }

  /**
   * Clear the array contents
   */
  public clear() {
    this.cachedGroup = -1;
    this.arrayContext.clear();
  }

  public toString() {
    let output = "PackedArray:\n";
    output += this.arrayContext.toString();
    return output;
  }
}
