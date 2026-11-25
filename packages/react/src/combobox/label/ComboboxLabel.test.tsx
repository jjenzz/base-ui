import { expect, describe, it } from 'vitest';
import * as React from 'react';
import { flushMicrotasks, screen, waitFor } from '@mui/internal-test-utils';
import { Combobox } from '@base-ui/react/combobox';
import { Field } from '@base-ui/react/field';
import { createRenderer, describeConformance } from '#test-utils';

describe('<Combobox.Label />', () => {
  const { render, renderToString } = createRenderer();

  function LabelledInput(props: { inputProps?: Combobox.Input.Props }) {
    return (
      <Combobox.Root>
        <Combobox.Label>Fruit</Combobox.Label>
        <Combobox.Input {...props.inputProps} />
      </Combobox.Root>
    );
  }

  describeConformance(<Combobox.Label />, () => ({
    refInstanceof: window.HTMLLabelElement,
    render(node) {
      return render(
        <Combobox.Root>
          {node}
          <Combobox.Input />
        </Combobox.Root>,
      );
    },
  }));

  describe('when the input is the form control', () => {
    it('labels the input with a native label', async () => {
      const { user } = await render(
        <Combobox.Root>
          <Combobox.Label>Fruit</Combobox.Label>
          <Combobox.InputGroup>
            <Combobox.Input />
            <Combobox.Trigger aria-label="Open popup" />
          </Combobox.InputGroup>
        </Combobox.Root>,
      );

      const label = screen.getByText('Fruit');
      const input = screen.getByRole('combobox');

      expect(label.tagName).toBe('LABEL');
      expect(label).toHaveAttribute('for', input.id);
      expect(screen.getByRole('combobox', { name: 'Fruit' })).toBe(input);
      expect(screen.getByRole('button', { name: 'Open popup' })).not.toHaveAttribute(
        'aria-labelledby',
      );

      expect(input).not.toHaveFocus();
      await user.click(label);
      expect(input).toHaveFocus();
    });

    it('points at an id set on the input', async () => {
      const { setProps } = await render(<LabelledInput inputProps={{ id: 'first' }} />);

      expect(screen.getByText('Fruit')).toHaveAttribute('for', 'first');

      await setProps({ inputProps: { id: 'second' } });

      expect(screen.getByRole('combobox')).toHaveAttribute('id', 'second');
      expect(screen.getByText('Fruit')).toHaveAttribute('for', 'second');
    });

    it('follows an id the input changes to without the label rendering', async () => {
      function SwitchingInput() {
        const [id, setId] = React.useState('first');
        return (
          <React.Fragment>
            <Combobox.Input id={id} />
            <button onClick={() => setId('second')}>Switch</button>
          </React.Fragment>
        );
      }

      const { user } = await render(
        <Combobox.Root>
          <Combobox.Label>Fruit</Combobox.Label>
          <SwitchingInput />
        </Combobox.Root>,
      );

      expect(screen.getByText('Fruit')).toHaveAttribute('for', 'first');

      await user.click(screen.getByRole('button', { name: 'Switch' }));

      expect(screen.getByRole('combobox')).toHaveAttribute('id', 'second');
      expect(screen.getByText('Fruit')).toHaveAttribute('for', 'second');
    });

    it('points at an id set on the input render element', async () => {
      await render(<LabelledInput inputProps={{ render: <input id="fruit-input" /> }} />);

      expect(screen.getByRole('combobox')).toHaveAttribute('id', 'fruit-input');
      expect(screen.getByText('Fruit')).toHaveAttribute('for', 'fruit-input');
    });

    it('labels the input of an inline combobox', async () => {
      await render(
        <Combobox.Root inline>
          <Combobox.Label>Fruit</Combobox.Label>
          <Combobox.Input />
        </Combobox.Root>,
      );

      const input = screen.getByRole('combobox');

      expect(input.id).not.toBe('');
      expect(screen.getByText('Fruit')).toHaveAttribute('for', input.id);
    });

    it('points at the input in server-rendered markup and after hydration', async () => {
      const { hydrate } = renderToString(<LabelledInput />);

      const serverId = screen.getByRole('combobox').id;
      expect(serverId).not.toBe('');
      expect(screen.getByText('Fruit')).toHaveAttribute('for', serverId);

      hydrate();
      await flushMicrotasks();

      expect(screen.getByRole('combobox')).toHaveAttribute('id', serverId);
      expect(screen.getByText('Fruit')).toHaveAttribute('for', serverId);
    });

    it('registers an id set on its render element as the input label inside Field', async () => {
      await render(
        <Field.Root>
          <Combobox.Root>
            <Combobox.Label render={<label id="fruit-label" />}>Fruit</Combobox.Label>
            <Combobox.Input />
          </Combobox.Root>
        </Field.Root>,
      );

      const input = screen.getByRole('combobox');

      expect(screen.getByText('Fruit')).toHaveAttribute('id', 'fruit-label');
      expect(screen.getByText('Fruit')).toHaveAttribute('for', input.id);
      expect(input).toHaveAttribute('aria-labelledby', 'fruit-label');
    });
  });

  describe('when the input is inside the popup', () => {
    function InputInsidePopup() {
      return (
        <Combobox.Root>
          <Combobox.Label>Fruit</Combobox.Label>
          <Combobox.Trigger>Open</Combobox.Trigger>
          <Combobox.Portal>
            <Combobox.Positioner>
              <Combobox.Popup>
                <Combobox.Input aria-label="Search" />
                <Combobox.List>
                  <Combobox.Item value="a">a</Combobox.Item>
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      );
    }

    it('labels the trigger without a native association', async () => {
      await render(<InputInsidePopup />);

      const label = screen.getByText('Fruit');
      const trigger = screen.getByRole('combobox');

      expect(label).not.toHaveAttribute('for');
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-labelledby', label.id);
      });
      expect(screen.getByRole('combobox', { name: 'Fruit' })).toBe(trigger);
    });

    it('labels the trigger with an id set on the label', async () => {
      await render(
        <Combobox.Root>
          <Combobox.Label id="fruit-label">Fruit</Combobox.Label>
          <Combobox.Trigger>Open</Combobox.Trigger>
        </Combobox.Root>,
      );

      expect(screen.getByText('Fruit')).toHaveAttribute('id', 'fruit-label');
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveAttribute('aria-labelledby', 'fruit-label');
      });
    });

    it('focuses the trigger without opening the popup when clicked', async () => {
      const { user } = await render(<InputInsidePopup />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).not.toHaveFocus();

      await user.click(screen.getByText('Fruit'));

      expect(trigger).toHaveFocus();
      expect(screen.queryByRole('dialog')).toBe(null);
    });
  });
});
