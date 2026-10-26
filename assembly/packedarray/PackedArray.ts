/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import {
  PackedArrayContext,
  MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY,
} from "./PackedArrayContext";

const NUMBER_OF_SETS: i32 = 8;
const NO_LEAF: i32 = -1;

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
  [key: number]: number;

  private arrayContext: PackedArrayContext;

  // Leaf cache for sequential reads.
  //
  // The 8 virtual indexes of a group (index >> 3) share one leaf per byte set,
  // so a scan over consecutive indexes would otherwise repeat the same set-tree
  // walks 8 times. leafIndexBySet remembers, for the group last read, the long
  // index of each set's leaf (NO_LEAF when the set has no entry for that
  // group). set() and add() record the leaves they insert for the cached group,
  // and anything that rebuilds the context invalidates the cache.
  private cachedGroup: i32 = -1;
  private leafIndexBySet: StaticArray<i32> = new StaticArray<i32>(
    NUMBER_OF_SETS
  );

  constructor(
    virtualLength: i32,
    initialPhysicalLength: i32 = MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY
  ) {
    this.arrayContext = new PackedArrayContext(
      virtualLength,
      initialPhysicalLength
    );
  }

  public resize(newVirtualArrayLength: i32): PackedArray {
    this.setVirtualLength(newVirtualArrayLength);
    return this;
  }

  public setVirtualLength(newVirtualArrayLength: i32): void {
    this.cachedGroup = -1;
    if (newVirtualArrayLength < this.length()) {
      throw new Error(
        "Cannot set virtual length, as requested length " +
          newVirtualArrayLength.toString() +
          " is smaller than the current virtual length " +
          this.length().toString()
      );
    }
    const currentArrayContext = this.arrayContext;
    if (
      currentArrayContext.isPacked &&
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

  @operator("[]") private __get(index: i32): u64 {
    return this.get(index);
  }

  @operator("[]=") private __set(index: i32, value: u64): void {
    this.set(index, value);
  }

  /**
   * Get value at virtual index in the array
   * @param index the virtual array index
   * @return the array value at the virtual index given
   */
  get(index: i32): u64 {
    const arrayContext = this.arrayContext;
    // Deal with unpacked context:
    if (!arrayContext.isPacked) {
      return arrayContext.getAtUnpackedIndex(index);
    }
    // Context is packed:
    if (index >> 3 != this.cachedGroup) {
      this.fillLeafCache(index);
    }
    const byteInLeaf = index & 0x7;
    const leafIndexBySet = this.leafIndexBySet;
    let value: u64 = 0;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      const leafIndex = unchecked(leafIndexBySet[byteNum]);
      if (leafIndex == NO_LEAF) {
        break;
      }
      value |=
        (<u64>arrayContext.getAtByteIndex((leafIndex << 3) + byteInLeaf)) <<
        (byteNum << 3);
    }
    return value;
  }

  /**
   * Walk the set trees once for the group of 8 indexes containing `index`, and
   * remember the leaf of every set that has one.
   */
  private fillLeafCache(index: i32): void {
    const arrayContext = this.arrayContext;
    const leafIndexBySet = this.leafIndexBySet;
    let byteNum = 0;
    for (; byteNum < NUMBER_OF_SETS; byteNum++) {
      const packedIndex = arrayContext.getPackedIndex(byteNum, index, false);
      if (packedIndex < 0) {
        break;
      }
      unchecked((leafIndexBySet[byteNum] = packedIndex >> 3));
    }
    // Sets are populated from byte 0 upwards (see set() and add()), so once a
    // set has no leaf for this group the higher sets have none either.
    for (; byteNum < NUMBER_OF_SETS; byteNum++) {
      unchecked((leafIndexBySet[byteNum] = NO_LEAF));
    }
    this.cachedGroup = index >> 3;
  }

  /** Keep the leaf cache coherent with a leaf just looked up with insertAsNeeded. */
  @inline
  private noteLeaf(index: i32, byteNum: i32, packedIndex: i32): void {
    if (index >> 3 == this.cachedGroup) {
      unchecked((this.leafIndexBySet[byteNum] = packedIndex >> 3));
    }
  }

  /**
   * Increment value at a virrual index in the array
   * @param index virtual index of value to increment
   */
  public increment(index: i32): void {
    this.add(index, 1);
  }

  private safeGetPackedIndexgetPackedIndex(
    setNumber: i32,
    virtualIndex: i32
  ): i32 {
    return this.arrayContext.getPackedIndex(setNumber, virtualIndex, true);
  }

  /**
   * Add to a value at a virtual index in the array
   * @param index the virtual index of the value to be added to
   * @param value the value to add
   */
  public add(index: i32, value: u64): void {
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
      this.noteLeaf(index, byteNum, packedIndex);

      const byteToAdd = <u8>(remainingValueToAdd & 0xff);
      const afterAddByteValue = arrayContext.addAtByteIndex(
        packedIndex,
        byteToAdd
      );

      // Move on to the next byte, accounting for the carry:
      remainingValueToAdd =
        (remainingValueToAdd >> 8) + <u64>(afterAddByteValue >> 8);

      if (remainingValueToAdd == 0) {
        return; // nothing to add to higher magnitudes
      }
    }
  }

  /**
   * Set the value at a virtual index in the array
   * @param index the virtual index of the value to set
   * @param value the value to set
   */
  set(index: i32, value: u64): void {
    const arrayContext = this.arrayContext;
    // Deal with unpacked context:
    if (!arrayContext.isPacked) {
      arrayContext.setAtUnpackedIndex(index, value);
      return;
    }
    // Context is packed:
    let valueForNextLevels = value;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      if (valueForNextLevels == 0) {
        // Special-case zeros to avoid inflating packed array for no reason
        const packedIndex = arrayContext.getPackedIndex(byteNum, index, false);
        if (packedIndex < 0) {
          return; // no need to create entries for zero values if they don't already exist
        }
      }
      // Make sure byte is populated:
      const packedIndex = arrayContext.getPackedIndex(byteNum, index, true);
      this.noteLeaf(index, byteNum, packedIndex);

      // Determine value to write, and prepare for next levels
      const byteToWrite: u8 = <u8>(valueForNextLevels & 0xff);
      valueForNextLevels = valueForNextLevels >> 8;

      arrayContext.setAtByteIndex(packedIndex, byteToWrite);
    }
  }

  /**
   * Get the current physical length (in longs) of the array's backing storage
   * @return the current physical length (in longs) of the array's current backing storage
   */
  getPhysicalLength(): i32 {
    return this.arrayContext.physicalLength;
  }

  public get estimatedFootprintInBytes(): i32 {
    // @ts-ignore
    return offsetof<PackedArray>() + this.getPhysicalLength();
  }

  /**
   * Get the (virtual) length of the array
   * @return the (virtual) length of the array
   */
  length(): i32 {
    return this.arrayContext.getVirtualLength();
  }

  /**
   * Clear the array contents
   */
  public clear(): void {
    this.cachedGroup = -1;
    this.arrayContext.clear();
  }

  public toString(): string {
    let output = "PackedArray:\n";
    output += this.arrayContext.toString();
    return output;
  }
}
