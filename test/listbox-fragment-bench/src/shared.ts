export interface Row { value: string; label: string; disabled: boolean }
export function createItems(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => {
    const value = String(index + 1);
    return { value, label: `Item ${value.padStart(5, '0')}`, disabled: (index + 1) % 10 === 0 };
  });
}

const COLOURS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet'];

// The colours of the rainbow, each numbered 00001 to `perColour`, in rainbow order.
export function createColourItems(perColour: number): Row[] {
  return COLOURS.flatMap((colour, colourIndex) =>
    Array.from({ length: perColour }, (_, index) => {
      const position = colourIndex * perColour + index;
      const number = String(index + 1).padStart(5, '0');
      return { value: `${colour}-${number}`, label: `${colour} ${number}`, disabled: (position + 1) % 10 === 0 };
    }),
  );
}
