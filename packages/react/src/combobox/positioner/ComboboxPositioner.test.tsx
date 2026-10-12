import { expect, vi, describe, it } from 'vitest';
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { screen, waitFor } from '@mui/internal-test-utils';
import { Combobox } from '@base-ui/react/combobox';
import {
  createRenderer,
  describeConformance,
  isJSDOM,
  positionerConformanceTests,
  waitSingleFrame,
} from '#test-utils';

describe('<Combobox.Positioner />', () => {
  const { render } = createRenderer();

  it('should not lock body scroll when controlled value={[]} triggers a re-render', async () => {
    // Render outside of act() to match real browser behavior where
    // the initial render and the useEffect re-render are separate commits.
    // Using act() batches them, hiding the bug.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');

    function Test() {
      const [, forceRender] = React.useState(0);
      React.useEffect(() => {
        forceRender(1);
      }, []);

      return (
        <Combobox.Root multiple value={[]}>
          <Combobox.Input />
          <Combobox.Portal>
            <Combobox.Positioner />
          </Combobox.Portal>
        </Combobox.Root>
      );
    }

    const root = ReactDOMClient.createRoot(container);
    root.render(<Test />);

    // Wait for mount + useEffect re-render + setTimeout(0) in ScrollLocker.acquire
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    // Bug: the re-render causes forceMount, mounting the Positioner.
    // The Positioner's `open` is `undefined` (not `false`), so
    // `open && modal` evaluates to `undefined`, which triggers
    // useScrollLock's default parameter `enabled = true`.
    const bodyOverflowX = document.body.style.overflowX;
    const bodyOverflowY = document.body.style.overflowY;
    const htmlOverflowX = document.documentElement.style.overflowX;
    const htmlOverflowY = document.documentElement.style.overflowY;

    root.unmount();
    container.remove();
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
    consoleSpy.mockRestore();

    expect(bodyOverflowX).not.toBe('hidden');
    expect(bodyOverflowY).not.toBe('hidden');
    expect(htmlOverflowX).not.toBe('hidden');
    expect(htmlOverflowY).not.toBe('hidden');
  });

  describe.skipIf(isJSDOM)('resizing the anchor', () => {
    it.each([{ keepMounted: false }, { keepMounted: true }])(
      'flips without ResizeObserver errors with keepMounted=$keepMounted',
      async ({ keepMounted }) => {
        const errors: string[] = [];
        const handleError = (event: ErrorEvent) => {
          if (event.message.includes('ResizeObserver loop')) {
            errors.push(event.message);
            event.preventDefault();
          }
        };
        window.addEventListener('error', handleError);

        function Test() {
          const [height, setHeight] = React.useState(34);
          const [top, setTop] = React.useState(window.innerHeight - 270);
          const [sideOffset, setSideOffset] = React.useState(4);
          const [anchorKey, setAnchorKey] = React.useState(0);
          return (
            <React.Fragment>
              <button onClick={() => setHeight(100)}>Grow</button>
              <button onClick={() => setHeight(34)}>Shrink</button>
              <button onClick={() => setTop(30)}>Move</button>
              <button onClick={() => setSideOffset(12)}>Offset</button>
              <button onClick={() => setAnchorKey((key) => key + 1)}>Replace anchor</button>
              <Combobox.Root open>
                <Combobox.InputGroup
                  key={anchorKey}
                  data-testid="anchor"
                  style={{ position: 'fixed', top, left: 40, width: 220, height }}
                >
                  <Combobox.Input aria-label="Languages" />
                </Combobox.InputGroup>
                <Combobox.Portal keepMounted={keepMounted}>
                  <Combobox.Positioner data-testid="positioner" sideOffset={sideOffset}>
                    <Combobox.Popup style={{ width: 220, height: 200 }}>
                      <Combobox.List>
                        <Combobox.Item value="JavaScript">JavaScript</Combobox.Item>
                      </Combobox.List>
                    </Combobox.Popup>
                  </Combobox.Positioner>
                </Combobox.Portal>
              </Combobox.Root>
            </React.Fragment>
          );
        }

        try {
          const { user } = await render(<Test />);
          const positioner = screen.getByTestId('positioner');
          await waitFor(() => expect(positioner).toHaveAttribute('data-side', 'bottom'));
          await user.click(screen.getByText('Grow'));
          await waitFor(() => expect(positioner).toHaveAttribute('data-side', 'top'));
          await user.click(screen.getByText('Shrink'));
          await waitSingleFrame();
          await waitSingleFrame();
          expect(positioner).toHaveAttribute('data-side', 'top');
          await user.click(screen.getByText('Move'));
          await waitFor(() => expect(positioner).toHaveAttribute('data-side', 'bottom'));
          await waitSingleFrame();
          await waitSingleFrame();
          const anchor = screen.getByTestId('anchor');
          expect(
            positioner.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom,
          ).toBe(4);
          await user.click(screen.getByText('Offset'));
          await waitFor(() =>
            expect(
              positioner.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom,
            ).toBe(12),
          );
          await user.click(screen.getByText('Replace anchor'));
          const replacementAnchor = screen.getByTestId('anchor');
          expect(replacementAnchor).not.toBe(anchor);
          await user.click(screen.getByText('Grow'));
          await waitFor(() =>
            expect(
              positioner.getBoundingClientRect().top -
                replacementAnchor.getBoundingClientRect().bottom,
            ).toBe(12),
          );
          await waitSingleFrame();
          await waitSingleFrame();
          expect(errors).toEqual([]);
        } finally {
          window.removeEventListener('error', handleError);
        }
      },
    );
  });

  describeConformance(<Combobox.Positioner />, () => ({
    refInstanceof: window.HTMLDivElement,
    render(node) {
      return render(
        <Combobox.Root open>
          <Combobox.Portal>{node}</Combobox.Portal>
        </Combobox.Root>,
      );
    },
  }));

  positionerConformanceTests({
    render,
    createComponent: ({ root, trigger, positioner, popup }) => (
      <Combobox.Root {...root}>
        <Combobox.Input {...trigger} />
        <Combobox.Portal>
          <Combobox.Positioner {...positioner}>
            <Combobox.Popup {...popup}>Popup</Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ),
  });

  // https://github.com/mui/base-ui/issues/5118
  it.skipIf(isJSDOM)(
    'keeps the popup on the preferred side when its capped height fits below tall content',
    async () => {
      const items = Array.from({ length: 40 }, (_, index) => `item-${index}`);

      await render(
        // Anchor fixed near the bottom of the viewport: less room below than above,
        // but still more than the List's capped height.
        <div style={{ position: 'fixed', bottom: 120, left: 100 }}>
          <Combobox.Root open items={items}>
            <Combobox.Input />
            <Combobox.Portal>
              <Combobox.Positioner data-testid="positioner" side="bottom" sideOffset={0}>
                <Combobox.Popup>
                  <Combobox.List
                    style={{ maxHeight: 'min(80px, var(--available-height))', overflowY: 'auto' }}
                  >
                    {(item: string) => (
                      <Combobox.Item key={item} value={item} style={{ height: 30 }}>
                        {item}
                      </Combobox.Item>
                    )}
                  </Combobox.List>
                </Combobox.Popup>
              </Combobox.Positioner>
            </Combobox.Portal>
          </Combobox.Root>
        </div>,
      );

      // The 40-item list (~1200px) overflows the room below the anchor, but the List is
      // capped to 80px which fits. The `--available-height` var must be seeded before
      // `size()` runs, otherwise `min(80px, var(--available-height))` is invalid on the
      // first `flip()` pass, the list is measured at full height, and the popup flips up.
      await waitFor(() => {
        expect(screen.getByTestId('positioner')).toHaveAttribute('data-side', 'bottom');
      });
    },
  );

  describe.skipIf(isJSDOM)('default anchor', () => {
    it('uses the input when input group is absent', async () => {
      const inputWidth = 120;
      const triggerWidth = 240;
      let anchorWidth = 0;
      const inputRef = React.createRef<HTMLInputElement>();

      await render(
        <Combobox.Root open>
          <Combobox.Input ref={inputRef} style={{ width: inputWidth }} />
          <Combobox.Trigger style={{ width: triggerWidth }}>Open</Combobox.Trigger>
          <Combobox.Portal>
            <Combobox.Positioner
              sideOffset={(data) => {
                anchorWidth = data.anchor.width;
                return 0;
              }}
            >
              <Combobox.Popup>
                <Combobox.List>
                  <Combobox.Item value="One">One</Combobox.Item>
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>,
      );

      await waitFor(() => {
        expect(anchorWidth).toBeCloseTo(inputRef.current!.getBoundingClientRect().width, 0);
      });
      expect(anchorWidth).not.toBeCloseTo(triggerWidth, 0);
    });

    it('uses the input group when present', async () => {
      const inputGroupWidth = 240;
      const inputWidth = 120;
      let anchorWidth = 0;

      await render(
        <Combobox.Root open>
          <Combobox.InputGroup style={{ width: inputGroupWidth }}>
            <Combobox.Input style={{ width: inputWidth }} />
            <Combobox.Trigger>Open</Combobox.Trigger>
          </Combobox.InputGroup>
          <Combobox.Portal>
            <Combobox.Positioner
              sideOffset={(data) => {
                anchorWidth = data.anchor.width;
                return 0;
              }}
            >
              <Combobox.Popup>
                <Combobox.List>
                  <Combobox.Item value="One">One</Combobox.Item>
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>,
      );

      await waitFor(() => {
        expect(anchorWidth).toBeCloseTo(inputGroupWidth, 0);
      });
    });
  });
});
