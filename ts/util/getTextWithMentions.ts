// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  DraftBodyRangeMention,
  DraftBodyRangesType,
} from '../types/BodyRange';

export function getTextWithMentions(
  bodyRanges: DraftBodyRangesType,
  text: string
): string {
  const sortableBodyRanges: Array<DraftBodyRangeMention> = bodyRanges.slice();
  return sortableBodyRanges
    .sort((a, b) => b.start - a.start)
    .reduce((acc, { start, length, replacementText }) => {
      const left = acc.slice(0, start);
      const right = acc.slice(start + length);
      return `${left}@${replacementText}${right}`;
    }, text);
}
