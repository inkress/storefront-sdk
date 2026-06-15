// Jest setup for @inkress/storefront-sdk — runs before each test suite.
const fetchMock = require('jest-fetch-mock');
fetchMock.enableMocks();

// In-memory localStorage mock so storage/cart tests run under jsdom.
const makeStorageMock = () => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index) => Object.keys(store)[index] || null,
  };
};

Object.defineProperty(window, 'localStorage', { value: makeStorageMock(), writable: true });
Object.defineProperty(window, 'sessionStorage', { value: makeStorageMock(), writable: true });

// File upload helpers used by the files resource tests.
Object.defineProperty(URL, 'createObjectURL', { writable: true, value: jest.fn(() => 'mock-url') });
Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: jest.fn() });
