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

const NUMBER_OF_SETS: u8 = 8;

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
    let value: u64 = 0;
    for (let byteNum: u8 = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      let byteValueAtPackedIndex: u64 = 0;

      // Deal with unpacked context:
      if (!this.arrayContext.isPacked) {
        return this.arrayContext.getAtUnpackedIndex(index);
      }
      // Context is packed:
      const packedIndex = this.arrayContext.getPackedIndex(
        byteNum,
        index,
        false
      );
      if (packedIndex < 0) {
        return value;
      }
      byteValueAtPackedIndex =
        (<u64>this.arrayContext.getAtByteIndex(packedIndex)) << (byteNum << 3);
      value += byteValueAtPackedIndex;
    }
    return value;
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
    let remainingValueToAdd = value;

    for (
      let byteNum = 0, byteShift = 0;
      byteNum < NUMBER_OF_SETS;
      byteNum++, byteShift += 8
    ) {
      // Deal with unpacked context:
      if (!this.arrayContext.isPacked) {
        this.arrayContext.addAndGetAtUnpackedIndex(index, value);
        return;
      }
      // Context is packed:
      const packedIndex = this.safeGetPackedIndexgetPackedIndex(byteNum, index);

      const byteToAdd = remainingValueToAdd & 0xff;

      const afterAddByteValue = this.arrayContext.addAtByteIndex(
        packedIndex,
        byteToAdd
      );

      // Reduce remaining value to add by amount just added:
      remainingValueToAdd -= byteToAdd;

      remainingValueToAdd = remainingValueToAdd >> 8;
      // Account for carry:
      remainingValueToAdd += afterAddByteValue >> 8;

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
    let bytesAlreadySet: u8 = 0;
    let valueForNextLevels = value;
    for (let byteNum: u8 = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      // Establish context within: critical section

      // Deal with unpacked context:
      if (!this.arrayContext.isPacked) {
        this.arrayContext.setAtUnpackedIndex(index, value);
        return;
      }
      // Context is packed:
      if (valueForNextLevels == 0) {
        // Special-case zeros to avoid inflating packed array for no reason
        const packedIndex = this.arrayContext.getPackedIndex(
          byteNum,
          index,
          false
        );
        if (packedIndex < 0) {
          return; // no need to create entries for zero values if they don't already exist
        }
      }
      // Make sure byte is populated:
      const packedIndex = this.arrayContext.getPackedIndex(
        byteNum,
        index,
        true
      );

      // Determine value to write, and prepare for next levels
      const byteToWrite: u8 = <u8>(valueForNextLevels & 0xff);
      valueForNextLevels = valueForNextLevels >> 8;

      if (byteNum < bytesAlreadySet) {
        // We want to avoid writing to the same byte twice when not doing so for the
        // entire 64 bit value atomically, as doing so opens a race with e.g. concurrent
        // adders. So dobn't actually write the byte if has been written before.
        continue;
      }
      this.arrayContext.setAtByteIndex(packedIndex, byteToWrite);
      bytesAlreadySet++;
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
    this.arrayContext.clear();
  }

  public toString(): string {
    let output = "PackedArray:\n";
    output += this.arrayContext.toString();
    return output;
  }
}
