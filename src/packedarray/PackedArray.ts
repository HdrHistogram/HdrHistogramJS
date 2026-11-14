/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import {
  PackedArrayContext,
  MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY,
} from "./PackedArrayContext";

const NUMBER_OF_SETS = 8;
// Leaf cache entry states, besides a leaf long index (>= 0)
const NO_LEAF = -1; // the set has no leaf for the cached group
const UNKNOWN_LEAF = -2; // the set is beyond knownSets (not looked up yet)
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

  // Leaf cache for sequential reads and writes.
  //
  // The 8 virtual indexes of a group (index >> 3) share one leaf per byte set,
  // so a scan over consecutive indexes would otherwise repeat the same set-tree
  // walks 8 times. For the group last accessed, leafIndexBySet[0 .. knownSets)
  // holds the long index of each set's leaf, or NO_LEAF when the set has no
  // entry for that group; sets from knownSets upwards have not been looked up
  // yet (writes only walk the sets they touch), whatever leafIndexBySet holds
  // there. The known sets always form a prefix because get(), add() and set()
  // resolve sets from byte 0 upwards and never skip one, so evicting a group
  // is a single knownSets = 0 rather than a reset of every entry, which keeps
  // the miss path (random recordValue) as cheap as before the cache. A leaf
  // never moves once created, so a cached leaf index stays valid for the
  // lifetime of the context, and every write that creates a leaf records it,
  // so a known NO_LEAF entry is always current. Any access to another group
  // evicts the cached one, writes included. Anything that rebuilds the context
  // invalidates the cache.
  private cachedGroup = -1;
  private knownSets = 0;
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
    this.knownSets = 0;
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
    this.cacheGroupOf(index);
    const leafIndexBySet = this.leafIndexBySet;
    const byteInLeaf = index & 0x7;
    let value = 0;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      let leafIndex =
        byteNum < this.knownSets ? leafIndexBySet[byteNum] : UNKNOWN_LEAF;
      if (leafIndex < 0) {
        // Sets are populated from byte 0 upwards (see set() and add()), so once
        // a set has no leaf for this group the higher sets have none either.
        if (leafIndex === NO_LEAF) {
          break;
        }
        const packedIndex = arrayContext.getPackedIndex(byteNum, index, false);
        this.knownSets = byteNum + 1;
        if (packedIndex < 0) {
          leafIndexBySet[byteNum] = NO_LEAF;
          break;
        }
        leafIndex = packedIndex >> 3;
        leafIndexBySet[byteNum] = leafIndex;
      }
      value +=
        arrayContext.getAtByteIndex(leafIndex * 8 + byteInLeaf) *
        BYTE_WEIGHTS[byteNum];
    }
    return value;
  }

  /**
   * Make the group of 8 indexes containing `index` the cached one, its leaves
   * to be looked up on demand.
   */
  private cacheGroupOf(index: number) {
    const group = floor(index / 8);
    if (group !== this.cachedGroup) {
      // No set is known after a miss, so every access walks set 0 first, and
      // getPackedIndex() checks the virtualLength bound there.
      this.cachedGroup = group;
      this.knownSets = 0;
    } else if (index >= this.arrayContext.getVirtualLength()) {
      // A hit skips the walk, and the last group may be partly beyond the bound
      throw new Error(
        `Attempting access at index ${index}, beyond virtualLength ${this.arrayContext.getVirtualLength()}`
      );
    }
  }

  /**
   * Increment value at a virrual index in the array
   * @param index virtual index of value to increment
   */
  public increment(index: number) {
    this.add(index, 1);
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
    this.cacheGroupOf(index);
    const leafIndexBySet = this.leafIndexBySet;
    const byteInLeaf = index & 0x7;
    let remainingValueToAdd = value;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      let leafIndex =
        byteNum < this.knownSets ? leafIndexBySet[byteNum] : UNKNOWN_LEAF;
      if (leafIndex < 0) {
        // Make sure byte is populated:
        const packedIndex = arrayContext.getPackedIndex(byteNum, index, true);
        if (packedIndex < 0) {
          // The packed storage is full, the lower bytes have already been added
          this.unpack();
          this.arrayContext.addAndGetAtUnpackedIndex(
            index,
            remainingValueToAdd * BYTE_WEIGHTS[byteNum]
          );
          return;
        }
        leafIndex = packedIndex >> 3;
        leafIndexBySet[byteNum] = leafIndex;
        // A known NO_LEAF is always the last known set (get() and a zero set()
        // stop there), so this never shrinks the prefix.
        this.knownSets = byteNum + 1;
      }

      // The low byte survives the int32 conversion, even above 2^32
      const byteToAdd = remainingValueToAdd & 0xff;
      const afterAddByteValue = arrayContext.addAtByteIndex(
        leafIndex * 8 + byteInLeaf,
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
    this.cacheGroupOf(index);
    const leafIndexBySet = this.leafIndexBySet;
    const byteInLeaf = index & 0x7;
    let valueForNextLevels = value;
    for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
      let leafIndex =
        byteNum < this.knownSets ? leafIndexBySet[byteNum] : UNKNOWN_LEAF;
      if (leafIndex < 0) {
        let packedIndex: number;
        if (valueForNextLevels === 0) {
          // Special-case zeros to avoid inflating packed array for no reason
          if (leafIndex === NO_LEAF) {
            return; // no need to create entries for zero values if they don't already exist
          }
          packedIndex = arrayContext.getPackedIndex(byteNum, index, false);
          if (packedIndex < 0) {
            leafIndexBySet[byteNum] = NO_LEAF;
            this.knownSets = byteNum + 1;
            return;
          }
        } else {
          // Make sure byte is populated:
          packedIndex = arrayContext.getPackedIndex(byteNum, index, true);
          if (packedIndex < 0) {
            // The packed storage is full
            this.unpack();
            this.arrayContext.setAtUnpackedIndex(index, value);
            return;
          }
        }
        leafIndex = packedIndex >> 3;
        leafIndexBySet[byteNum] = leafIndex;
        // A known NO_LEAF is always the last known set (get() and a zero set()
        // stop there), so this never shrinks the prefix.
        this.knownSets = byteNum + 1;
      }

      // Determine value to write, and prepare for next levels
      const byteToWrite = valueForNextLevels & 0xff;
      valueForNextLevels = floor(valueForNextLevels / 256);

      arrayContext.setAtByteIndex(leafIndex * 8 + byteInLeaf, byteToWrite);
    }
  }

  /**
   * Lowest index >= fromIndex holding a non-zero value, or -1 when there is none.
   *
   * On a packed context the set-0 tree is walked to skip the groups of 8
   * indexes that were never populated, so a scan over the whole array costs
   * time proportional to the populated groups rather than to the virtual
   * length. An unpacked context is scanned linearly.
   */
  nextNonZeroIndex(fromIndex: number): number {
    const arrayContext = this.arrayContext;
    const length = arrayContext.getVirtualLength();
    let index = fromIndex;
    if (!arrayContext.isPacked) {
      for (; index < length; index++) {
        if (arrayContext.getAtUnpackedIndex(index) !== 0) {
          return index;
        }
      }
      return -1;
    }
    while (index < length) {
      index = arrayContext.nextIndexWithLeaf(index);
      if (index < 0) {
        return -1;
      }
      // The leaf found only vouches for the group of 8 indexes holding index
      const groupEnd = Math.min((index | 0x7) + 1, length);
      for (; index < groupEnd; index++) {
        if (this.get(index) !== 0) {
          return index;
        }
      }
    }
    return -1;
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
    this.knownSets = 0;
    this.arrayContext.clear();
  }

  public toString() {
    let output = "PackedArray:\n";
    output += this.arrayContext.toString();
    return output;
  }
}
