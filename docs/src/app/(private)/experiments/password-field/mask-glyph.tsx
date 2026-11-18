'use client';
import * as React from 'react';
import { PasswordFieldPreview as PasswordField } from '@base-ui/react/password-field';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { createMaskFont } from './mask-font';
import type { MaskFont } from './mask-font';
import styles from './mask-glyph.module.css';

const PRESETS = {
  Star: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6L12 2z',
  Heart:
    'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z',
  Asterisk:
    'M11 2h2v20h-2z M3.84 6.13L21.16 16.13L20.16 17.87L2.84 7.87z M20.16 6.13L21.16 7.87L3.84 17.87L2.84 16.13z',
  Ring: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z',
  Diamond: 'M12 2l8 10-8 10-8-10z',
  Square: 'M4 4h16v16H4z',
} as const;

type PresetName = keyof typeof PRESETS;

export default function PasswordFieldMaskGlyph() {
  const [preset, setPreset] = React.useState<PresetName | 'Custom'>('Star');
  const [customPath, setCustomPath] = React.useState<string>(PRESETS.Star);
  const [viewBox, setViewBox] = React.useState('0 0 24 24');
  const [size, setSize] = React.useState(0.6);
  const [spacing, setSpacing] = React.useState(0.1);
  const [fontSize, setFontSize] = React.useState(14);

  const path = preset === 'Custom' ? customPath : PRESETS[preset];

  return (
    <div className={styles.Page}>
      <h1>Password mask glyph</h1>
      <p className={styles.Intro}>
        Builds a one-glyph TrueType font at runtime and loads it with <code>unicode-range</code> for
        the characters browsers use to mask passwords (U+2022 and U+25CF). The caret, selection,
        scrolling and revealed text stay native. Fonts only fill outlines, so stroked icons
        won&apos;t work.
      </p>

      <div className={styles.Demo} style={{ fontSize }}>
        <MaskGlyphPasswordField
          label="Password"
          maskGlyph={path}
          maskGlyphViewBox={viewBox}
          maskGlyphSize={size}
          maskGlyphSpacing={spacing}
        />
      </div>

      <fieldset className={styles.Controls}>
        <legend>Glyph</legend>
        <div className={styles.Presets}>
          {[...(Object.keys(PRESETS) as PresetName[]), 'Custom' as const].map((name) => (
            <button
              key={name}
              type="button"
              className={styles.Preset}
              aria-pressed={preset === name}
              onClick={() => {
                setPreset(name);
                if (name !== 'Custom') {
                  setCustomPath(PRESETS[name]);
                  setViewBox('0 0 24 24');
                }
              }}
            >
              {name !== 'Custom' && (
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                  <path d={PRESETS[name]} fill="currentColor" />
                </svg>
              )}
              {name}
            </button>
          ))}
        </div>

        {preset === 'Custom' && (
          <React.Fragment>
            <label className={styles.Control}>
              Path data
              <textarea
                className={styles.TextArea}
                value={customPath}
                onChange={(event) => setCustomPath(event.target.value)}
                rows={3}
                spellCheck={false}
              />
            </label>
            <label className={styles.Control}>
              viewBox
              <input
                className={styles.TextInput}
                value={viewBox}
                onChange={(event) => setViewBox(event.target.value)}
                spellCheck={false}
              />
            </label>
          </React.Fragment>
        )}

        <Slider label="Size" value={size} min={0.2} max={1} step={0.05} onChange={setSize} />
        <Slider
          label="Spacing"
          value={spacing}
          min={0}
          max={0.6}
          step={0.05}
          onChange={setSpacing}
        />
        <Slider
          label="Font size"
          value={fontSize}
          min={10}
          max={40}
          step={1}
          unit="px"
          onChange={setFontSize}
        />
      </fieldset>
    </div>
  );
}

interface MaskGlyphPasswordFieldProps {
  label: string;
  /** SVG path data for a filled shape. Sketches a `maskGlyph` prop on `PasswordField.Input`. */
  maskGlyph: string;
  maskGlyphViewBox?: string;
  maskGlyphSize?: number;
  maskGlyphSpacing?: number;
}

function MaskGlyphPasswordField(props: MaskGlyphPasswordFieldProps) {
  const { label, maskGlyph, maskGlyphViewBox, maskGlyphSize, maskGlyphSpacing } = props;
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // The font is built from the path with DOM APIs, so it can only be created on the client.
  const [result, setResult] = React.useState<{ font: MaskFont | null; error: string | null }>({
    font: null,
    error: null,
  });
  useIsoLayoutEffect(() => {
    try {
      setResult({
        font: createMaskFont({
          path: maskGlyph,
          viewBox: maskGlyphViewBox,
          size: maskGlyphSize,
          spacing: maskGlyphSpacing,
        }),
        error: null,
      });
    } catch (error) {
      setResult({ font: null, error: error instanceof Error ? error.message : String(error) });
    }
  }, [maskGlyph, maskGlyphViewBox, maskGlyphSize, maskGlyphSpacing]);

  // The mask font goes first; `unicode-range` makes every other character fall through to the
  // input's own font. Read that font before overriding it.
  const [baseFontFamily, setBaseFontFamily] = React.useState<string | null>(null);
  useIsoLayoutEffect(() => {
    if (inputRef.current) {
      setBaseFontFamily(getComputedStyle(inputRef.current).fontFamily);
    }
  }, []);

  // Browsers reject malformed fonts silently in CSS, so load a copy through the FontFace API to
  // surface the error.
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const font = result.font;
  React.useEffect(() => {
    if (!font) {
      return undefined;
    }
    let canceled = false;
    new FontFace(`${font.family}-check`, font.bytes)
      .load()
      .then(() => !canceled && setLoadError(null))
      .catch((error: unknown) => !canceled && setLoadError(String(error)));
    return () => {
      canceled = true;
    };
  }, [font]);

  const error = result.error ?? loadError;

  return (
    <PasswordField.Root id={id} className={styles.Field}>
      {font && (
        <style href={font.family} precedence="medium">
          {font.css}
        </style>
      )}
      <label htmlFor={id} className={styles.Label}>
        {label}
      </label>
      <div className={styles.InputGroup}>
        <PasswordField.Input
          ref={inputRef}
          className={styles.Input}
          placeholder="Enter your password"
          style={
            font && baseFontFamily
              ? { fontFamily: `"${font.family}", ${baseFontFamily}` }
              : undefined
          }
        />
        <PasswordField.Toggle className={styles.Toggle} aria-label="Show password">
          <PasswordField.ToggleIndicator className={styles.Icon} match="masked">
            <EyeOffIcon />
          </PasswordField.ToggleIndicator>
          <PasswordField.ToggleIndicator className={styles.Icon} match="visible">
            <EyeIcon />
          </PasswordField.ToggleIndicator>
        </PasswordField.Toggle>
      </div>
      {error ? (
        <p className={styles.Error}>{error}</p>
      ) : (
        font && (
          <p className={styles.Meta}>
            {font.bytes.length} byte font · <code>{font.family}</code>
          </p>
        )
      )}
    </PasswordField.Root>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const { label, value, min, max, step, unit = 'em', onChange } = props;
  return (
    <label className={styles.Control}>
      <span>
        {label}: {value}
        {unit}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function EyeIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
      <path
        d="M1.333 8s2.334-4.667 6.667-4.667S14.667 8 14.667 8 12.333 12.667 8 12.667 1.333 8 1.333 8Z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function EyeOffIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
      <path
        d="M2 2l12 12M7.067 7.067a2 2 0 0 0 2.8 2.8M6.267 3.467A6.467 6.467 0 0 1 8 3.333c4.333 0 6.667 4.667 6.667 4.667a11.333 11.333 0 0 1-1.6 2.2M4.133 4.133A11.333 11.333 0 0 0 1.333 8s2.334 4.667 6.667 4.667a6.467 6.467 0 0 0 2-.334"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}
