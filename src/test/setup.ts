import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom 30 не реалізує showModal/close у <dialog>; Modal спирається на них.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
