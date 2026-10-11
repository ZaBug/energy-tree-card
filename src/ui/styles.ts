import { css } from "lit";

/** Card frame: header, layout toggle, notes. */
export const cardStyles = css`
  :host {
    display: block;
  }
  ha-card {
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    color: var(--primary-text-color, #212121);
  }
  .header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 16px 0;
  }
  .titles {
    flex: 1 1 auto;
    min-width: 0;
  }
  .title {
    font-size: var(--ha-card-header-font-size, 24px);
    line-height: 32px;
    color: var(--ha-card-header-color, var(--primary-text-color, #212121));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .period {
    font-size: 13px;
    line-height: 18px;
    color: var(--secondary-text-color, #727272);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .header.no-title .period {
    font-size: 14px;
    line-height: 32px;
    color: var(--primary-text-color, #212121);
  }
  .toggle {
    flex: none;
    display: inline-flex;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 20px;
    overflow: hidden;
  }
  /* 44 x 40 px: big enough to hit with a thumb on a phone. */
  .toggle button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 40px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--secondary-text-color, #727272);
    cursor: pointer;
    font: inherit;
    --mdc-icon-size: 18px;
  }
  .toggle button + button {
    border-left: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
  }
  .toggle button.active {
    color: var(--primary-color, #03a9f4);
  }
  /* Tint in the current colour; opacity on a pseudo element keeps it theme-agnostic. */
  .toggle button.active::before {
    content: "";
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0.14;
    pointer-events: none;
  }
  .toggle button:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: -2px;
  }
  .content {
    padding: 8px 16px 16px;
  }
  .content.stale {
    opacity: 0.6;
  }
  .note,
  .error {
    font-size: 12px;
    line-height: 16px;
    margin: 0 0 8px;
  }
  .note {
    color: var(--secondary-text-color, #727272);
  }
  .error {
    color: var(--error-color, #db4437);
  }
  .loading {
    padding: 24px 0;
    text-align: center;
    color: var(--secondary-text-color, #727272);
  }
  .na {
    cursor: help;
  }
`;
