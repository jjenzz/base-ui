'use client';
import * as React from 'react';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import type { FieldRoot } from '../../field/root/FieldRoot';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useLabel } from '../../internals/labelable-provider/useLabel';
import { resolveRenderedId } from '../../internals/resolveRenderedId';
import { useComboboxRootContext } from '../root/ComboboxRootContext';

/**
 * An accessible label that is automatically associated with the combobox input.
 * Renders a `<label>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxLabel = React.forwardRef(function ComboboxLabel(
  componentProps: ComboboxLabel.Props,
  forwardedRef: React.ForwardedRef<HTMLElement>,
) {
  const { render, className, style, id: idProp, ...elementProps } = componentProps;

  const fieldRootContext = useFieldRootContext();
  const store = useComboboxRootContext();

  const inputInsidePopup = store.useState('inputInsidePopup');
  const triggerElement = store.useState('triggerElement');
  const inputElement = store.useState('inputElement');
  const renderedInputId = store.useState('renderedInputId');
  const rootId = store.useState('id');

  // The trigger is the form control only when the input is inside the popup. Until the parts
  // mount, assume the input is the control: the server can't tell the patterns apart, and the
  // input and the trigger both default to the root id.
  const triggerIsControl = inputInsidePopup && triggerElement != null;

  // An inline input's default id isn't the root id, so it's read from the mounted input.
  const inputId = (renderedInputId ?? inputElement?.id ?? rootId) || undefined;

  // The label id is registered with Field and the trigger's `aria-labelledby`, so an id on the
  // render element, which is the one rendered, is the one registered.
  const labelProps = useLabel({
    id: resolveRenderedId(componentProps, idProp),
    // A native label on the trigger button would forward hover and clicks to it, so the
    // trigger is labelled through `aria-labelledby` and focused on click instead.
    native: !triggerIsControl,
    fallbackControlId: triggerIsControl ? triggerElement.id : undefined,
    setLabelId(nextLabelId) {
      const resolvedLabelId =
        typeof nextLabelId === 'function' ? nextLabelId(store.state.labelId) : nextLabelId;
      store.set('labelId', resolvedLabelId);
    },
  });

  return useRenderElement('label', componentProps, {
    ref: forwardedRef,
    state: fieldRootContext.state,
    // `htmlFor` follows the id the input renders with, including one set on its render element.
    props: [labelProps, elementProps, { htmlFor: triggerIsControl ? undefined : inputId }],
    stateAttributesMapping: fieldValidityMapping,
  });
});

export interface ComboboxLabelState extends FieldRoot.State {}

export interface ComboboxLabelProps extends Omit<
  BaseUIComponentProps<'label', ComboboxLabelState>,
  'htmlFor'
> {}

export namespace ComboboxLabel {
  export type State = ComboboxLabelState;
  export type Props = ComboboxLabelProps;
}
