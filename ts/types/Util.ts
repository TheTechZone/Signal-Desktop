// Copyright 2018 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable @typescript-eslint/no-namespace */

import type { IntlShape } from 'react-intl';
import type { UUIDStringType } from './UUID';

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

// export type DraftBodyRangeType = BodyRangeType & {
export type DraftBodyRangeMention = BodyRangeMention & {
  replacementText: string;
};

// export type DraftBodyRangesType = ReadonlyArray<DraftBodyRangeType>;
export type DraftBodyRangesType = ReadonlyArray<DraftBodyRangeMention>;

// Fully hydrated body range to be used in UI components.

export type HydratedBodyRangeMention = DraftBodyRangeMention & {
  conversationID: string;
};

export type HydratedBodyRangeType = HydratedBodyRangeMention | BodyRangeStyle;

export type HydratedBodyRangesType = ReadonlyArray<HydratedBodyRangeType>;

export type StoryContextType = {
  authorUuid?: UUIDStringType;
  timestamp: number;
};

export type RenderTextCallbackType = (options: {
  text: string;
  key: number;
}) => JSX.Element | string;

export type ReplacementValuesType =
  | Array<string>
  | {
      [key: string]: string | number | undefined;
    };

export type LocalizerType = {
  (key: string, values?: ReplacementValuesType): string;
  getIntl(): IntlShape;
  isLegacyFormat(key: string): boolean;
  getLocale(): string;
};

export enum SentMediaQualityType {
  'standard' = 'standard',
  'high' = 'high',
}

export enum ThemeType {
  'light' = 'light',
  'dark' = 'dark',
}

// These are strings so they can be interpolated into class names.
export enum ScrollBehavior {
  Default = 'default',
  Hard = 'hard',
}

type InternalAssertProps<
  Result,
  Value,
  Missing = Omit<Result, keyof Value>
> = keyof Missing extends never
  ? Result
  : Result & {
      [key in keyof Required<Missing>]: [
        never,
        'AssertProps: missing property'
      ];
    };

export type AssertProps<Result, Value> = InternalAssertProps<Result, Value>;

export type UnwrapPromise<Value> = Value extends Promise<infer T> ? T : Value;

export type BytesToStrings<Value> = Value extends Uint8Array
  ? string
  : { [Key in keyof Value]: BytesToStrings<Value[Key]> };
