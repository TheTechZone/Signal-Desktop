// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import type { RangeNode } from '../../types/BodyRange';
import { BodyRange, insertRange } from '../../types/BodyRange';

const mentionInfo = {
  mentionUuid: 'someid',
  conversationID: 'convoid',
  replacementText: 'dude',
};

describe('insertRange', () => {
  it('inserts a single mention', () => {
    const result = insertRange({ start: 5, length: 1, ...mentionInfo }, []);

    assert.deepEqual(result, [
      {
        start: 5,
        length: 1,
        ranges: [],
        ...mentionInfo,
      },
    ]);
  });

  it('inserts a mention into a bold range', () => {
    const existingRanges = [
      {
        start: 5,
        length: 10,
        style: BodyRange.Style.BOLD,
        ranges: [],
      },
    ];

    const result = insertRange(
      { start: 7, length: 1, ...mentionInfo },
      existingRanges
    );

    // it nests the mention inside the bold range
    // and offsets the mention by the bold range start
    assert.deepEqual(result, [
      {
        start: 5,
        length: 10,
        style: BodyRange.Style.BOLD,
        ranges: [{ start: 2, length: 1, ranges: [], ...mentionInfo }],
      },
    ]);
  });

  it('intersects ranges by splitting up and nesting', () => {
    const ranges = [
      {
        start: 5,
        length: 10,
        style: BodyRange.Style.BOLD,
      },
      {
        start: 10,
        length: 10,
        style: BodyRange.Style.ITALIC,
      },
    ];

    const result = ranges.reduce<ReadonlyArray<RangeNode>>(
      (acc, r) => insertRange(r, acc),
      []
    );

    assert.deepEqual(result, [
      {
        start: 5,
        length: 10,
        style: BodyRange.Style.BOLD,
        ranges: [
          { start: 5, length: 5, style: BodyRange.Style.ITALIC, ranges: [] },
        ],
      },
      { start: 15, length: 5, style: BodyRange.Style.ITALIC, ranges: [] },
    ]);
  });
});
