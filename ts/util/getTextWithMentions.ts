// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { DraftBodyRangeMention } from '../types/BodyRange';

export function getTextWithMentions(
  mentions: ReadonlyArray<DraftBodyRangeMention>,
  text: string
): string {
  const sortableMentions: Array<DraftBodyRangeMention> = mentions.slice();
  return sortableMentions
    .sort((a, b) => b.start - a.start)
    .reduce((acc, { start, length, replacementText }) => {
      const left = acc.slice(0, start);
      const right = acc.slice(start + length);
      return `${left}@${replacementText}${right}`;
    }, text);
}
