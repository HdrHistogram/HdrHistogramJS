import {
  PackedArrayContext,
  MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY
} from "./PackedArrayContext";
import { ResizeError } from "./ResizeError";

const NUMBER_OF_SETS = 8;
const { pow, floor } = Math;

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

  constructor(
    virtualLength: number,
    initialPhysicalLength: number = MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY
  ) {
    this.arrayContext = new PackedArrayContext(
      virtualLength,
      initialPhysicalLength
    );
  }

  resizeStorageArray(newPhysicalLengthInLongs: number) {
    const oldArrayContext = this.arrayContext;
    this.arrayContext = oldArrayContext.copyAndIncreaseSize(
      newPhysicalLengthInLongs
    );
    /*for (IterationValue v : oldArrayContext.nonZeroValues()) {
        set(v.getIndex(), v.getValue());
    }*/
  }

  /**
   * Get value at virtual index in the array
   * @param index the virtual array index
   * @return the array value at the virtual index given
   */
  get(index: number) {
    let value = 0;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      let byteValueAtPackedIndex = 0;

      // Deal with unpacked context:
      if (!this.arrayContext.isPacked) {
        throw "not implemented";
        // TODO return this.arrayContext.getAtUnpackedIndex(index);
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
        this.arrayContext.getAtByteIndex(packedIndex) * pow(2, byteNum << 3);
      value += byteValueAtPackedIndex;
    }
    return value;
  }

  /**
   * Add to a value at a virtual index in the array
   * @param index the virtual index of the value to be added to
   * @param value the value to add
   */
  add(index: number, value: number) {
    let bytesAlreadySet = 0;
    do {
      let remainingValueToAdd = value;
      try {
        for (
          let byteNum = 0, byteShift = 0, byteMask = 0xff;
          byteNum < NUMBER_OF_SETS;
          byteNum++, byteShift += 8, byteMask <<= 8
        ) {
          // Deal with unpacked context:
          if (!this.arrayContext.isPacked) {
            throw "not implemented";
            // TODO this.arrayContext.setAtUnpackedIndex(index, value);
          }
          // Context is packed:
          const packedIndex = this.arrayContext.getPackedIndex(
            byteNum,
            index,
            true
          );

          const byteToAdd = remainingValueToAdd & 0xff;

          const afterAddByteValue = this.arrayContext.addAtByteIndex(
            packedIndex,
            byteToAdd
          );

          // Reduce remaining value to add by amount just added:
          remainingValueToAdd -= byteToAdd;

          // Account for carry:
          const carryAmount = afterAddByteValue & 0x100;
          remainingValueToAdd += carryAmount;

          remainingValueToAdd = remainingValueToAdd / pow(2, 8);

          if (remainingValueToAdd == 0) {
            return; // nothing to add to higher magnitudes
          }
        }
        return;
      } catch (ex) {
        if (ex instanceof ResizeError) {
          this.resizeStorageArray(ex.newSize);
        } else {
          throw ex;
        }
      }
    } while (true);
  }

  /**
   * Set the value at a virtual index in the array
   * @param index the virtual index of the value to set
   * @param value the value to set
   */
  set(index: number, value: number) {
    let bytesAlreadySet = 0;
    do {
      let valueForNextLevels = value;
      try {
        for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
          // Establish context within: critical section

          // Deal with unpacked context:
          if (!this.arrayContext.isPacked) {
            throw "not implemented";
            // TODO this.arrayContext.setAtUnpackedIndex(index, value);
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
          const byteToWrite = valueForNextLevels & 0xff;
          valueForNextLevels = floor(valueForNextLevels / pow(2, 8));

          if (byteNum < bytesAlreadySet) {
            // We want to avoid writing to the same byte twice when not doing so for the
            // entire 64 bit value atomically, as doing so opens a race with e.g. concurrent
            // adders. So dobn't actually write the byte if has been written before.
            continue;
          }
          this.arrayContext.setAtByteIndex(packedIndex, byteToWrite);
          bytesAlreadySet++;
        }
        return;
      } catch (ex) {
        if (ex instanceof ResizeError) {
          this.resizeStorageArray(ex.newSize);
        } else {
          throw ex;
        }
      }
    } while (true);
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

  public toString() {
    let output = "PackedArray:\n";
    output += this.arrayContext.toString();
    return output;
  }
}
