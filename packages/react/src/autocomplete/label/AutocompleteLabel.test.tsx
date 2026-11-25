import { expect, describe, it } from 'vitest';
import { screen } from '@mui/internal-test-utils';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Field } from '@base-ui/react/field';
import { createRenderer, describeConformance } from '#test-utils';

describe('<Autocomplete.Label />', () => {
  const { render, renderToString } = createRenderer();

  describeConformance(<Autocomplete.Label />, () => ({
    refInstanceof: window.HTMLLabelElement,
    render(node) {
      return render(
        <Autocomplete.Root>
          {node}
          <Autocomplete.Input />
        </Autocomplete.Root>,
      );
    },
  }));

  it('labels the input without labeling the trigger', async () => {
    await render(
      <Autocomplete.Root>
        <Autocomplete.Label>Fruit</Autocomplete.Label>
        <Autocomplete.Input />
        <Autocomplete.Trigger aria-label="Open popup" />
      </Autocomplete.Root>,
    );

    const input = screen.getByRole('combobox', { name: 'Fruit' });
    expect(screen.getByText('Fruit')).toHaveAttribute('for', input.id);
    expect(screen.getByRole('button', { name: 'Open popup' })).not.toHaveAttribute(
      'aria-labelledby',
    );
  });

  it('associates with the input in server-rendered markup', () => {
    renderToString(
      <Autocomplete.Root>
        <Autocomplete.Label>Fruit</Autocomplete.Label>
        <Autocomplete.Input />
      </Autocomplete.Root>,
    );

    const input = screen.getByRole('combobox');
    expect(input.id).not.toBe('');
    expect(screen.getByText('Fruit')).toHaveAttribute('for', input.id);
  });

  it('follows a custom input id', async () => {
    await render(
      <Autocomplete.Root>
        <Autocomplete.Label>Fruit</Autocomplete.Label>
        <Autocomplete.Input id="custom-input" />
      </Autocomplete.Root>,
    );

    expect(screen.getByText('Fruit')).toHaveAttribute('for', 'custom-input');
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveAttribute('id', 'custom-input');
  });

  it('focuses the input when clicked', async () => {
    const { user } = await render(
      <Autocomplete.Root>
        <Autocomplete.Label>Fruit</Autocomplete.Label>
        <Autocomplete.Input />
      </Autocomplete.Root>,
    );

    const input = screen.getByRole('combobox');
    expect(input).not.toHaveFocus();

    await user.click(screen.getByText('Fruit'));

    expect(input).toHaveFocus();
  });

  describe('Field', () => {
    it('labels the field control and reflects field state', async () => {
      await render(
        <Field.Root invalid disabled>
          <Autocomplete.Root>
            <Autocomplete.Label>Fruit</Autocomplete.Label>
            <Autocomplete.Input />
          </Autocomplete.Root>
        </Field.Root>,
      );

      const label = screen.getByText('Fruit');
      const input = screen.getByRole('combobox', { name: 'Fruit' });
      expect(label).toHaveAttribute('for', input.id);
      expect(input).toHaveAttribute('aria-labelledby', label.id);
      expect(label).toHaveAttribute('data-invalid');
      expect(label).toHaveAttribute('data-disabled');
    });

    it('uses the root id as the field control id', async () => {
      await render(
        <Field.Root>
          <Autocomplete.Root id="fruit">
            <Autocomplete.Label>Fruit</Autocomplete.Label>
            <Autocomplete.Input />
          </Autocomplete.Root>
        </Field.Root>,
      );

      expect(screen.getByText('Fruit')).toHaveAttribute('for', 'fruit');
      expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveAttribute('id', 'fruit');
    });
  });
});
