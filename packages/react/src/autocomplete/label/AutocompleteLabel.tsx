'use client';
import * as React from 'react';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import type { FieldRoot } from '../../field/root/FieldRoot';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useLabel } from '../../internals/labelable-provider/useLabel';
import { resolveRenderedId } from '../../internals/resolveRenderedId';
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
  const { render, className, style, id: idProp, ...elementProps } = componentProps;

  const fieldRootContext = useFieldRootContext();
  const store = useComboboxRootContext();

  const renderedInputId = store.useState('renderedInputId');
  const rootId = store.useState('id');

  // Inside a Field, the label id is registered so the input's `aria-labelledby` points at it, so
  // an id on the render element, which is the one rendered, is the one registered.
  const labelProps = useLabel({ id: resolveRenderedId(componentProps, idProp), native: true });

  return useRenderElement('label', componentProps, {
    ref: forwardedRef,
    state: fieldRootContext.state,
    // `htmlFor` follows the id the input renders with, including one set on its render element.
    props: [labelProps, elementProps, { htmlFor: (renderedInputId ?? rootId) || undefined }],
    stateAttributesMapping: fieldValidityMapping,
  });
});

export interface AutocompleteLabelState extends FieldRoot.State {}

export interface AutocompleteLabelProps extends Omit<
  BaseUIComponentProps<'label', AutocompleteLabelState>,
  'htmlFor'
> {}

export namespace AutocompleteLabel {
  export type State = AutocompleteLabelState;
  export type Props = AutocompleteLabelProps;
}
