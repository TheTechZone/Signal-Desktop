// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable @typescript-eslint/no-namespace */

import { SignalService as Proto } from '../protobuf';

// Cold storage of body ranges

export type BodyRangeBase = {
  start: number;
  length: number;
};

export type BodyRangeMention = BodyRangeBase & {
  mentionUuid: string;
};

export type BodyRangeStyle = BodyRangeBase & {
  style: Proto.DataMessage.BodyRange.Style;
};

export type BodyRangeType = BodyRangeMention | BodyRangeStyle;

export type BodyRangesType = ReadonlyArray<BodyRangeType>;

export namespace BodyRange {
  export type Style = Proto.DataMessage.BodyRange.Style;
  export const { Style } = Proto.DataMessage.BodyRange;

  export function isMention(
    bodyRange: HydratedBodyRangeType
  ): bodyRange is HydratedBodyRangeMention;
  export function isMention(
    bodyRange: BodyRangeType
  ): bodyRange is BodyRangeMention;
  export function isMention<
    T extends BodyRangeType,
    X extends BodyRangeMention & T
  >(bodyRange: T): bodyRange is X {
    return (
      ('mentionUuid' as const satisfies keyof BodyRangeMention) in bodyRange
    );
  }
  export function isStyle(
    bodyRange: BodyRangeType
  ): bodyRange is BodyRangeStyle {
    return ('style' as const satisfies keyof BodyRangeStyle) in bodyRange;
  }
}

// Used exclusive in CompositionArea and related conversation_view.tsx calls.

export type DraftBodyRangeMention = BodyRangeMention & {
  replacementText: string;
};

export type DraftBodyRangesType = ReadonlyArray<DraftBodyRangeMention>;

// Fully hydrated body range to be used in UI components.

export type HydratedBodyRangeMention = DraftBodyRangeMention & {
  conversationID: string;
};

export type HydratedBodyRangeType = HydratedBodyRangeMention | BodyRangeStyle;

export type HydratedBodyRangesType = ReadonlyArray<HydratedBodyRangeType>;
