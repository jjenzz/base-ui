'use client';
import * as React from 'react';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import type { FieldRoot } from '../../field/root/FieldRoot';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useLabel } from '../../internals/labelable-provider/useLabel';
import { getDefaultLabelId } from '../../utils/resolveAriaLabelledBy';
import { useComboboxRootContext } from '../../combobox/root/ComboboxRootContext';

/**
 * An accessible label that is automatically associated with the autocomplete input.
 * Renders a `<label>` element.
 *
 * Documentation: [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
 */
export const AutocompleteLabel = React.forwardRef(function AutocompleteLabel(
  componentProps: AutocompleteLabel.Props,
  forwardedRef: React.ForwardedRef<HTMLLabelElement>,
) {
  const { render, className, style, ...elementProps } = componentProps;
  // Keep label id derived from the root and ignore runtime `id` overrides from untyped consumers.
  const elementPropsWithoutId = elementProps as typeof elementProps & { id?: string | undefined };
  delete elementPropsWithoutId.id;

  const fieldRootContext = useFieldRootContext();
  const store = useComboboxRootContext();

  const inputElement = store.useState('inputElement');
  const rootId = store.useState('id');

  const labelProps = useLabel({
    id: getDefaultLabelId(rootId),
    // The input takes the root id unless it has its own `id`.
    fallbackControlId: inputElement?.id || rootId,
    native: true,
  });

  return useRenderElement('label', componentProps, {
    ref: forwardedRef,
    state: fieldRootContext.state,
    props: [labelProps, elementProps],
    stateAttributesMapping: fieldValidityMapping,
  });
});

export interface AutocompleteLabelState extends FieldRoot.State {}

export interface AutocompleteLabelProps extends Omit<
  BaseUIComponentProps<'label', AutocompleteLabelState>,
  'id'
> {}

export namespace AutocompleteLabel {
  export type State = AutocompleteLabelState;
  export type Props = AutocompleteLabelProps;
}
