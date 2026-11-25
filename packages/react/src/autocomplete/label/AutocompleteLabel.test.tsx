import { expect, describe, it } from 'vitest';
import { flushMicrotasks, screen } from '@mui/internal-test-utils';
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

    const label = screen.getByText('Fruit');
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
    expect(screen.getByRole('button', { name: 'Open popup' })).not.toHaveAttribute(
      'aria-labelledby',
    );
  });

  it('points at the input in server-rendered markup and after hydration', async () => {
    const { hydrate } = renderToString(
      <Autocomplete.Root>
        <Autocomplete.Label>Fruit</Autocomplete.Label>
        <Autocomplete.Input />
      </Autocomplete.Root>,
    );

    const serverId = screen.getByRole('combobox').id;
    expect(serverId).not.toBe('');
    expect(screen.getByText('Fruit')).toHaveAttribute('for', serverId);

    hydrate();
    await flushMicrotasks();

    expect(screen.getByRole('combobox')).toHaveAttribute('id', serverId);
    expect(screen.getByText('Fruit')).toHaveAttribute('for', serverId);
  });

  it('points at the id set on the Root', async () => {
    await render(
      <Autocomplete.Root id="fruit">
        <Autocomplete.Label>Fruit</Autocomplete.Label>
        <Autocomplete.Input />
      </Autocomplete.Root>,
    );

    expect(screen.getByText('Fruit')).toHaveAttribute('for', 'fruit');
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveAttribute('id', 'fruit');
  });

  it('follows the id set on the Input as it changes', async () => {
    const { setProps } = await render(<TestAutocomplete inputId="first" />);

    expect(screen.getByText('Fruit')).toHaveAttribute('for', 'first');

    await setProps({ inputId: 'second' });

    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveAttribute('id', 'second');
    expect(screen.getByText('Fruit')).toHaveAttribute('for', 'second');

    function TestAutocomplete(props: { inputId: string }) {
      return (
        <Autocomplete.Root>
          <Autocomplete.Label>Fruit</Autocomplete.Label>
          <Autocomplete.Input id={props.inputId} />
        </Autocomplete.Root>
      );
    }
  });

  it('points at an id set on the Input render element', async () => {
    await render(
      <Autocomplete.Root id="fruit">
        <Autocomplete.Label>Fruit</Autocomplete.Label>
        <Autocomplete.Input render={<input id="custom-input" />} />
      </Autocomplete.Root>,
    );

    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'custom-input');
    expect(screen.getByText('Fruit')).toHaveAttribute('for', 'custom-input');
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

  describe('Field integration', () => {
    it('labels the input with the id from Field.Root', async () => {
      await render(
        <Field.Root>
          <Autocomplete.Root>
            <Autocomplete.Label>Fruit</Autocomplete.Label>
            <Autocomplete.Input />
          </Autocomplete.Root>
        </Field.Root>,
      );

      const label = screen.getByText('Fruit');
      const input = screen.getByRole('combobox', { name: 'Fruit' });
      expect(input.id).not.toBe('');
      expect(label).toHaveAttribute('for', input.id);
      expect(input).toHaveAttribute('aria-labelledby', label.id);
    });

    it('points at the id set on the Input', async () => {
      await render(
        <Field.Root>
          <Autocomplete.Root>
            <Autocomplete.Label>Fruit</Autocomplete.Label>
            <Autocomplete.Input id="custom-input" />
          </Autocomplete.Root>
        </Field.Root>,
      );

      expect(screen.getByText('Fruit')).toHaveAttribute('for', 'custom-input');
    });

    it('registers an id set on its render element as the input label', async () => {
      await render(
        <Field.Root>
          <Autocomplete.Root>
            <Autocomplete.Label render={<label id="fruit-label" />}>Fruit</Autocomplete.Label>
            <Autocomplete.Input />
          </Autocomplete.Root>
        </Field.Root>,
      );

      expect(screen.getByText('Fruit')).toHaveAttribute('id', 'fruit-label');
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-labelledby', 'fruit-label');
    });

    it('reflects the Field state', async () => {
      await render(
        <Field.Root invalid disabled>
          <Autocomplete.Root>
            <Autocomplete.Label>Fruit</Autocomplete.Label>
            <Autocomplete.Input />
          </Autocomplete.Root>
        </Field.Root>,
      );

      const label = screen.getByText('Fruit');
      expect(label).toHaveAttribute('data-invalid');
      expect(label).toHaveAttribute('data-disabled');
    });
  });
});
