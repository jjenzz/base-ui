import { expect, describe, it } from 'vitest';
import { screen, waitFor } from '@mui/internal-test-utils';
import { Combobox } from '@base-ui/react/combobox';
import { createRenderer, describeConformance } from '#test-utils';

describe('<Combobox.Label />', () => {
  const { render, renderToString } = createRenderer();

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

    it('labels an input with a custom id', async () => {
      await render(
        <Combobox.Root>
          <Combobox.Label>Fruit</Combobox.Label>
          <Combobox.Input id="fruit-input" />
        </Combobox.Root>,
      );

      expect(screen.getByText('Fruit')).toHaveAttribute('for', 'fruit-input');
    });

    it('associates the label with the input in server-rendered markup', () => {
      renderToString(
        <Combobox.Root>
          <Combobox.Label>Fruit</Combobox.Label>
          <Combobox.Input data-testid="input" />
        </Combobox.Root>,
      );

      const input = screen.getByTestId('input');

      expect(input.id).not.toBe('');
      expect(screen.getByText('Fruit')).toHaveAttribute('for', input.id);
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
