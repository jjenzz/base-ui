'use client';
import * as React from 'react';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import type { FieldRoot } from '../../field/root/FieldRoot';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useLabel } from '../../internals/labelable-provider/useLabel';
import { getDefaultLabelId } from '../../utils/resolveAriaLabelledBy';
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
  const { render, className, style, ...elementProps } = componentProps;
  // Keep label id derived from the root and ignore runtime `id` overrides from untyped consumers.
  const elementPropsWithoutId = elementProps as typeof elementProps & { id?: string | undefined };
  delete elementPropsWithoutId.id;

  const fieldRootContext = useFieldRootContext();
  const store = useComboboxRootContext();

  const inputInsidePopup = store.useState('inputInsidePopup');
  const triggerElement = store.useState('triggerElement');
  const inputElement = store.useState('inputElement');
  const rootId = store.useState('id');
  const defaultLabelId = getDefaultLabelId(rootId);

  // The trigger is the form control only when the input is inside the popup. Until the parts
  // mount, assume the input is the control: the server can't tell the patterns apart, and the
  // input and the trigger both default to the root id.
  const triggerIsControl = inputInsidePopup && triggerElement != null;

  const labelProps = useLabel({
    id: defaultLabelId,
    // A native label on the trigger button would forward hover and clicks to it, so the
    // trigger is labelled through `aria-labelledby` and focused on click instead.
    native: !triggerIsControl,
    fallbackControlId: triggerIsControl ? triggerElement.id : (inputElement?.id ?? rootId),
    setLabelId(nextLabelId) {
      const resolvedLabelId =
        typeof nextLabelId === 'function' ? nextLabelId(store.state.labelId) : nextLabelId;
      store.set('labelId', resolvedLabelId);
    },
  });

  return useRenderElement('label', componentProps, {
    ref: forwardedRef,
    state: fieldRootContext.state,
    props: [labelProps, elementProps],
    stateAttributesMapping: fieldValidityMapping,
  });
});

export interface ComboboxLabelState extends FieldRoot.State {}

export interface ComboboxLabelProps extends Omit<
  BaseUIComponentProps<'label', ComboboxLabelState>,
  'id'
> {}

export namespace ComboboxLabel {
  export type State = ComboboxLabelState;
  export type Props = ComboboxLabelProps;
}
