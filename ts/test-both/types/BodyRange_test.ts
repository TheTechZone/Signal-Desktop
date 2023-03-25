// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import type { RangeNode } from '../../types/BodyRange';
import {
  BodyRange,
  DisplayStyle,
  applyRangesForText,
  insertRange,
  processBodyRangesForSearchResult,
  sortRanges,
} from '../../types/BodyRange';

const mentionInfo = {
  mentionUuid: 'someid',
  conversationID: 'convoid',
  replacementText: 'dude',
};

describe('BodyRanges', () => {
  describe('sortRanges', () => {
    it('sorts all mentions last', () => {
      const ranges = [
        {
          start: 0,
          length: 111,
          mentionUuid: 'abc',
          conversationID: 'x',
          replacementText: 'Friend 1',
        },
        {
          start: 64,
          length: 14,
          mentionUuid: 'abc',
          conversationID: 'x',
          replacementText: 'Friend 2',
        },
        {
          start: 0,
          length: 111,
          style: BodyRange.Style.ITALIC,
        },
        {
          start: 64,
          length: 14,
          style: BodyRange.Style.MONOSPACE,
        },
      ];

      const sorted = sortRanges(ranges);

      assert.deepEqual(sorted, [
        {
          start: 0,
          length: 111,
          style: BodyRange.Style.ITALIC,
        },
        {
          start: 64,
          length: 14,
          style: BodyRange.Style.MONOSPACE,
        },
        {
          start: 0,
          length: 111,
          mentionUuid: 'abc',
          conversationID: 'x',
          replacementText: 'Friend 1',
        },
        {
          start: 64,
          length: 14,
          mentionUuid: 'abc',
          conversationID: 'x',
          replacementText: 'Friend 2',
        },
      ]);
    });

    it('sorts by length, then by start order', () => {
      const ranges = [
        {
          start: 10,
          length: 40,
          style: BodyRange.Style.BOLD,
        },
        {
          start: 64,
          length: 14,
          style: BodyRange.Style.MONOSPACE,
        },
        {
          start: 40,
          length: 60,
          style: BodyRange.Style.STRIKETHROUGH,
        },
        {
          start: 0,
          length: 111,
          style: BodyRange.Style.ITALIC,
        },
        {
          start: 0,
          length: 40,
          style: BodyRange.Style.BOLD,
        },
      ];

      const sorted = sortRanges(ranges);

      assert.deepEqual(sorted, [
        {
          start: 0,
          length: 111,
          style: BodyRange.Style.ITALIC,
        },
        {
          start: 40,
          length: 60,
          style: BodyRange.Style.STRIKETHROUGH,
        },
        {
          start: 0,
          length: 40,
          style: BodyRange.Style.BOLD,
        },
        {
          start: 10,
          length: 40,
          style: BodyRange.Style.BOLD,
        },
        {
          start: 64,
          length: 14,
          style: BodyRange.Style.MONOSPACE,
        },
      ]);
    });
  });

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

    it('handles triple-nesting', () => {
      /* eslint-disable max-len */
      //                                                                 m            m
      // b                                      bs                                                          s
      // i                                                                                                             i
      // Italic Start and Bold Start ... Bold EndStrikethrough Start ... Monospace Pop! ... Strikethrough End Italic End',
      /* eslint-enable max-len */
      const ranges = [
        {
          start: 0,
          length: 40,
          style: BodyRange.Style.BOLD,
        },
        {
          start: 0,
          length: 111,
          style: BodyRange.Style.ITALIC,
        },
        {
          start: 40,
          length: 60,
          style: BodyRange.Style.STRIKETHROUGH,
        },
        {
          start: 64,
          length: 14,
          style: BodyRange.Style.MONOSPACE,
        },
      ];

      const result = ranges.reduce<ReadonlyArray<RangeNode>>(
        (acc, r) => insertRange(r, acc),
        []
      );

      assert.deepEqual(result, [
        {
          start: 0,
          length: 40,
          style: BodyRange.Style.BOLD,
          ranges: [
            {
              start: 0,
              length: 40,
              style: BodyRange.Style.ITALIC,
              ranges: [],
            },
          ],
        },
        {
          start: 40,
          length: 71,
          style: BodyRange.Style.ITALIC,
          ranges: [
            {
              start: 0,
              length: 60,
              style: BodyRange.Style.STRIKETHROUGH,
              ranges: [
                {
                  start: 24,
                  length: 14,
                  style: BodyRange.Style.MONOSPACE,
                  ranges: [],
                },
              ],
            },
          ],
        },
      ]);
    });

    it('handles triple-nesting, with out-of-order inputs', () => {
      /* eslint-disable max-len */
      //                                                                 m            m
      // b                                      bs                                                          s
      // i                                                                                                             i
      // Italic Start and Bold Start ... Bold EndStrikethrough Start ... Monospace Pop! ... Strikethrough End Italic End',
      /* eslint-enable max-len */
      const ranges = [
        {
          start: 64,
          length: 14,
          style: BodyRange.Style.MONOSPACE,
        },
        {
          start: 40,
          length: 60,
          style: BodyRange.Style.STRIKETHROUGH,
        },
        {
          start: 0,
          length: 111,
          style: BodyRange.Style.ITALIC,
        },
        {
          start: 0,
          length: 40,
          style: BodyRange.Style.BOLD,
        },
      ];

      const result = ranges.reduce<ReadonlyArray<RangeNode>>(
        (acc, r) => insertRange(r, acc),
        []
      );

      assert.deepEqual(result, [
        {
          start: 0,
          length: 40,
          style: BodyRange.Style.ITALIC,
          ranges: [
            {
              start: 0,
              length: 40,
              style: BodyRange.Style.BOLD,
              ranges: [],
            },
          ],
        },
        {
          start: 40,
          length: 24,
          style: BodyRange.Style.STRIKETHROUGH,
          ranges: [
            {
              start: 0,
              length: 24,
              style: BodyRange.Style.ITALIC,
              ranges: [],
            },
          ],
        },
        {
          start: 64,
          length: 14,
          style: BodyRange.Style.MONOSPACE,
          ranges: [
            {
              start: 0,
              length: 14,
              style: BodyRange.Style.STRIKETHROUGH,
              ranges: [
                {
                  start: 0,
                  length: 14,
                  style: BodyRange.Style.ITALIC,
                  ranges: [],
                },
              ],
            },
          ],
        },
        {
          start: 78,
          length: 22,
          style: BodyRange.Style.STRIKETHROUGH,
          ranges: [
            {
              start: 0,
              length: 22,
              style: BodyRange.Style.ITALIC,
              ranges: [],
            },
          ],
        },
        {
          start: 100,
          length: 11,
          style: BodyRange.Style.ITALIC,
          ranges: [],
        },
      ]);
    });
  });

  describe('processBodyRangesForSearchResult', () => {
    it('returns proper bodyRange surrounding keyword', () => {
      const { cleanedSnippet, bodyRanges } = processBodyRangesForSearchResult({
        snippet: "What's <<left>>going<<right>> on?",
        body: "What's going on?",
        bodyRanges: [],
      });

      assert.strictEqual(cleanedSnippet, "What's going on?");
      assert.lengthOf(bodyRanges, 1);
      assert.deepEqual(bodyRanges[0], {
        start: 7,
        length: 5,
        displayStyle: DisplayStyle.SearchKeywordHighlight,
      });
    });

    it('returns proper bodyRange surrounding keyword, with trailing ...', () => {
      const { cleanedSnippet, bodyRanges } = processBodyRangesForSearchResult({
        snippet: "What's <<left>>going<<right>> on<<truncation>>",
        body: "What's going on, man? Good to see you!",
        bodyRanges: [],
      });

      assert.strictEqual(cleanedSnippet, "What's going on...");
      assert.lengthOf(bodyRanges, 1);
      assert.deepEqual(bodyRanges[0], {
        start: 7,
        length: 5,
        displayStyle: DisplayStyle.SearchKeywordHighlight,
      });
    });

    it('returns proper bodyRange surrounding keyword, with leading ...', () => {
      const { cleanedSnippet, bodyRanges } = processBodyRangesForSearchResult({
        snippet: "<<truncation>>what's <<left>>going<<right>> on<<truncation>>",
        body: "And what's going on with you?",
        bodyRanges: [],
      });

      assert.strictEqual(cleanedSnippet, "...what's going on...");
      assert.lengthOf(bodyRanges, 1);
      assert.deepEqual(bodyRanges[0], {
        start: 10,
        length: 5,
        displayStyle: DisplayStyle.SearchKeywordHighlight,
      });
    });

    it('handles multiple mentions without leading/trailing ...', () => {
      const bodyRanges = [
        {
          start: 0,
          length: 1,
          mentionUuid: '7d007e95-771d-43ad-9191-eaa86c773cb8',
          replacementText: 'Alice',
          conversationID: 'x',
        },
        {
          start: 21,
          length: 1,
          mentionUuid: '7d007e95-771d-43ad-9191-eaa86c773cb8',
          replacementText: 'Eve',
          conversationID: 'x',
        },
      ];
      const { cleanedSnippet, bodyRanges: processedBodyRanges } =
        processBodyRangesForSearchResult({
          snippet: "\uFFFC, what's <<left>>going<<right>> with \uFFFC?",
          body: "\uFFFC, what's going with \uFFFC?",
          bodyRanges,
        });

      assert.strictEqual(cleanedSnippet, "\uFFFC, what's going with \uFFFC?");
      assert.lengthOf(processedBodyRanges, 3);

      assert.deepEqual(processedBodyRanges[0], bodyRanges[0]);
      assert.deepEqual(processedBodyRanges[1], bodyRanges[1]);
      assert.deepEqual(processedBodyRanges[2], {
        start: 10,
        length: 5,
        displayStyle: DisplayStyle.SearchKeywordHighlight,
      });
    });

    it('handles multiple mentions with leading/trailing ...', () => {
      const bodyRanges = [
        {
          start: 18,
          length: 1,
          mentionUuid: '7d007e95-771d-43ad-9191-eaa86c773cb8',
          replacementText: 'Alice',
          conversationID: 'x',
        },
        {
          start: 39,
          length: 1,
          mentionUuid: '7d007e95-771d-43ad-9191-eaa86c773cb8',
          replacementText: 'Bob',
          conversationID: 'x',
        },
        {
          start: 45,
          length: 1,
          mentionUuid: '7d007e95-771d-43ad-9191-eaa86c773cb8',
          replacementText: 'Eve',
          conversationID: 'x',
        },
      ];
      const { cleanedSnippet, bodyRanges: processedBodyRanges } =
        processBodyRangesForSearchResult({
          snippet:
            "<<truncation>>What's <<left>>going<<right>> with \uFFFC and<<truncation>>",
          body: "I'm just not sure \uFFFC. What's going with \uFFFC and \uFFFC?",
          bodyRanges,
        });

      assert.strictEqual(cleanedSnippet, "...What's going with \uFFFC and...");

      assert.lengthOf(processedBodyRanges, 2);
      assert.deepEqual(processedBodyRanges[0], {
        ...bodyRanges[1],
        start: 21,
      });
      assert.deepEqual(processedBodyRanges[1], {
        start: 10,
        length: 5,
        displayStyle: DisplayStyle.SearchKeywordHighlight,
      });
    });

    it('handles formatting that overlaps original snippet in interesting ways, with leading/trailing ...', () => {
      const bodyRanges = [
        {
          // Overlaps just start
          start: 0,
          length: 19,
          style: BodyRange.Style.BOLD,
        },
        {
          // Contains snippet entirely
          start: 0,
          length: 54,
          style: BodyRange.Style.ITALIC,
        },
        {
          // Contained by snippet
          start: 19,
          length: 10,
          style: BodyRange.Style.MONOSPACE,
        },
        {
          // Overlaps just end
          start: 29,
          length: 25,
          style: BodyRange.Style.STRIKETHROUGH,
        },
      ];
      const { cleanedSnippet, bodyRanges: processedBodyRanges } =
        processBodyRangesForSearchResult({
          snippet:
            '<<truncation>>playing with formatting in <<left>>fun<<right>> ways<<truncation>>',
          body: "We're playing with formatting in fun ways like you do!",
          bodyRanges,
        });

      assert.strictEqual(
        cleanedSnippet,
        '...playing with formatting in fun ways...'
      );

      assert.lengthOf(processedBodyRanges, 5);
      assert.deepEqual(processedBodyRanges[0], {
        // Still overlaps just start
        start: 3,
        length: 13,
        style: BodyRange.Style.BOLD,
      });
      assert.deepEqual(processedBodyRanges[1], {
        // Now overlaps full snippet
        start: 3,
        length: 35,
        style: BodyRange.Style.ITALIC,
      });
      assert.deepEqual(processedBodyRanges[2], {
        // Still contained by snippet
        start: 16,
        length: 10,
        style: BodyRange.Style.MONOSPACE,
      });
      assert.deepEqual(processedBodyRanges[3], {
        // Still overlaps just end of snippet
        start: 26,
        length: 12,
        style: BodyRange.Style.STRIKETHROUGH,
      });
      assert.deepEqual(processedBodyRanges[4], {
        start: 30,
        length: 3,
        displayStyle: DisplayStyle.SearchKeywordHighlight,
      });
    });
  });

  describe('applyRangesForText', () => {
    it('handles mentions, replaces in reverse order', () => {
      const mentions = [
        {
          start: 0,
          length: 1,
          mentionUuid: 'blarg',
          replacementText: 'jerry',
          conversationID: 'x',
        },
        {
          start: 7,
          length: 1,
          mentionUuid: 'abcdef',
          replacementText: 'fred',
          conversationID: 'x',
        },
      ];
      const text = "\uFFFC says \uFFFC, I'm here";
      assert.strictEqual(
        applyRangesForText({ text, mentions, spoilers: [] }),
        "@jerry says @fred, I'm here"
      );
    });

    it('handles spoilers, replaces in reverse order', () => {
      const spoilers = [
        {
          start: 18,
          length: 16,
          style: BodyRange.Style.SPOILER,
        },
        {
          start: 46,
          length: 17,
          style: BodyRange.Style.SPOILER,
        },
      ];
      const text =
        "It's so cool when the balrog fight happens in Lord of the Rings!";
      assert.strictEqual(
        applyRangesForText({ text, mentions: [], spoilers }),
        "It's so cool when ■■■■ happens in ■■■■!"
      );
    });

    it('handles mentions that are removed by spoilers', () => {
      const mentions = [
        {
          start: 49,
          length: 1,
          mentionUuid: 'abcdef',
          replacementText: 'alice',
          conversationID: 'x',
        },
        {
          start: 55,
          length: 1,
          mentionUuid: 'abcdef',
          replacementText: 'bob',
          conversationID: 'x',
        },
      ];
      const spoilers = [
        {
          start: 49,
          length: 7,
          style: BodyRange.Style.SPOILER,
        },
      ];

      const text =
        "The recipients of today's appreciation award are \uFFFC and \uFFFC!";
      assert.strictEqual(
        applyRangesForText({ text, mentions, spoilers }),
        "The recipients of today's appreciation award are ■■■■!"
      );
    });

    it('handles mentions that need to be moved because of spoilers', () => {
      const mentions = [
        {
          start: 0,
          length: 1,
          mentionUuid: 'abcdef',
          replacementText: 'eve',
          conversationID: 'x',
        },
        {
          start: 52,
          length: 1,
          mentionUuid: 'abcdef',
          replacementText: 'alice',
          conversationID: 'x',
        },
        {
          start: 58,
          length: 1,
          mentionUuid: 'abcdef',
          replacementText: 'bob',
          conversationID: 'x',
        },
      ];
      const spoilers = [
        {
          start: 21,
          length: 26,
          style: BodyRange.Style.SPOILER,
        },
      ];

      const text =
        "\uFFFC: The recipients of today's appreciation award are \uFFFC and \uFFFC!";
      assert.strictEqual(
        applyRangesForText({ text, mentions, spoilers }),
        '@eve: The recipients of ■■■■ are @alice and @bob!'
      );
    });
  });
});
