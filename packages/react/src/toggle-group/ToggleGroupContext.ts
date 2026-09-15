'use client';
import * as React from 'react';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import type { BaseUIEventReasons } from '../internals/reasons';
import type { ToggleGroupValue } from './ToggleGroup';

export interface ToggleGroupContext<Value extends string> {
  value: ToggleGroupValue<Value>;
  setGroupValue: (
    newValue: Value,
    nextPressed: boolean,
    eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
  ) => void;
  disabled: boolean;
  /**
   * Indicates whether the value has been initialized via `value` or `defaultValue` props.
   * Used to determine if Toggle should warn users about data inconsistency problems.
   */
  isValueInitialized: boolean;
}

export const ToggleGroupContext = React.createContext<ToggleGroupContext<any> | undefined>(
  undefined,
);

export function useToggleGroupContext<Value extends string>() {
  return React.useContext<ToggleGroupContext<Value> | undefined>(ToggleGroupContext);
}
