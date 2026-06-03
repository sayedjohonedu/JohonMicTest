const { applyTextReplacements } = require('../src/main/text-replacements');
const store = require('../store/config');

// Mock the store so we can set config values for testing
jest.mock('../store/config', () => ({
  get: jest.fn()
}));

describe('applyTextReplacements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockStore = (enabled, rules, inline = true) => {
    store.get.mockImplementation(key => {
      if (key === 'textReplaceEnabled') return enabled;
      if (key === 'textReplacements') return rules;
      if (key === 'textReplaceInline') return inline;
      return null;
    });
  };

  describe('Early returns', () => {
    it('should return original text if replacements are not enabled', () => {
      mockStore(false, [{ say: 'hello', replace: 'hi' }]);
      expect(applyTextReplacements('Hello world')).toBe('Hello world');
      expect(store.get).toHaveBeenCalledWith('textReplaceEnabled');
    });

    it('should return original text if rules list is empty', () => {
      mockStore(true, []);
      expect(applyTextReplacements('Hello world')).toBe('Hello world');
    });

    it('should return original text if rules list is null or undefined', () => {
      mockStore(true, null);
      expect(applyTextReplacements('Hello world')).toBe('Hello world');
    });
  });

  describe('INLINE mode (textReplaceInline = true)', () => {
    it('should replace trigger phrase case-insensitively', () => {
      mockStore(true, [{ say: 'My Email', replace: 'john@example.com' }]);
      expect(applyTextReplacements('Send it to my email please')).toBe('Send it to john@example.com please');
    });

    it('should replace multiple occurrences of the trigger phrase', () => {
      mockStore(true, [{ say: 'apple', replace: 'orange' }]);
      expect(applyTextReplacements('I have an apple, you have an Apple.')).toBe('I have an orange, you have an orange.');
    });

    it('should not match partial words (word-boundary aware)', () => {
      mockStore(true, [{ say: 'cat', replace: 'dog' }]);
      expect(applyTextReplacements('The cat is in the category')).toBe('The dog is in the category');
    });

    it('should handle regex special characters in trigger phrase', () => {
      mockStore(true, [{ say: 'hello.world', replace: 'hi earth' }]);
      expect(applyTextReplacements('hello.world to you')).toBe('hi earth to you');
    });

    it('should handle regex special characters in trigger phrase cleanly', () => {
      mockStore(true, [{ say: 'mr. smith', replace: 'Agent Smith' }]);
      expect(applyTextReplacements('I saw mr. smith today')).toBe('I saw Agent Smith today');

      // Should not match "mrX smith" where . means any character
      expect(applyTextReplacements('I saw mrX smith today')).toBe('I saw mrX smith today');
    });

    it('should ignore rules with empty "say" values', () => {
      mockStore(true, [
        { say: '', replace: 'nothing' },
        { say: '  ', replace: 'nothing' },
        { say: 'real', replace: 'actual' }
      ]);
      expect(applyTextReplacements('This is real')).toBe('This is actual');
    });

    it('should replace with empty string if "replace" value is missing', () => {
      mockStore(true, [{ say: 'um' }]);
      expect(applyTextReplacements('Well um I think so')).toBe('Well  I think so');
    });
  });

  describe('EXACT mode (textReplaceInline = false)', () => {
    it('should replace when text matches exactly (case-insensitive)', () => {
      mockStore(true, [{ say: 'My Email', replace: 'john@example.com' }], false);
      expect(applyTextReplacements('my email')).toBe('john@example.com');
    });

    it('should ignore partial/substring matches', () => {
      mockStore(true, [{ say: 'My Email', replace: 'john@example.com' }], false);
      expect(applyTextReplacements('Send it to my email')).toBe('Send it to my email');
    });

    it('should match after trimming input text', () => {
      mockStore(true, [{ say: 'shortcut', replace: 'Action executed' }], false);
      expect(applyTextReplacements('   shortcut  \n')).toBe('Action executed');
    });

    it('should ignore rules with empty "say" values', () => {
      mockStore(true, [
        { say: '', replace: 'nothing' },
        { say: 'hello', replace: 'hi' }
      ], false);
      expect(applyTextReplacements('hello')).toBe('hi');
    });

    it('should replace with empty string if "replace" value is missing', () => {
      mockStore(true, [{ say: 'delete me' }], false);
      expect(applyTextReplacements('delete me')).toBe('');
    });

    it('should return original text if no exact match is found', () => {
      mockStore(true, [{ say: 'hello', replace: 'hi' }], false);
      expect(applyTextReplacements('goodbye')).toBe('goodbye');
    });
  });
});
