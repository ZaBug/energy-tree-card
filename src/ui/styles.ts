import { css } from "lit";

/** Card frame: title, notes. */
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
