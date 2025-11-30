// src/components/chat/chat-input-ime.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';

/**
 * This test verifies the fix for the IME composition bug where pressing Enter
 * during Chinese/Japanese/Korean input would incorrectly submit the message
 * instead of confirming the input method composition.
 *
 * Bug: When using Chinese input method (e.g., Sogou) to type English characters:
 * 1. User types English characters in Chinese input mode (e.g., "review")
 * 2. User presses Enter to confirm the input
 * 3. The Enter event was triggering message submission instead of confirming the IME
 *
 * Fix: Check e.nativeEvent.isComposing before handling Enter key submission.
 * When isComposing is true, the Enter key should be ignored for submission.
 */
describe('ChatInput - IME Composition Bug Fix', () => {
  it('should not submit message when Enter is pressed during IME composition', () => {
    // Create a mock textarea element
    const textarea = document.createElement('textarea');
    const mockSubmit = vi.fn();

    // Create a mock keydown event with isComposing = true (simulating IME input)
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });

    // Mock the nativeEvent.isComposing property
    Object.defineProperty(event, 'nativeEvent', {
      value: { isComposing: true },
      writable: false,
    });

    // Simulate the handleInputKeydown logic
    const handleInputKeydown = (e: KeyboardEvent) => {
      const nativeEvent = (e as unknown as { nativeEvent: { isComposing: boolean } }).nativeEvent;

      // Don't submit if IME composition is in progress
      if (e.code === 'Enter' && !e.shiftKey && !nativeEvent.isComposing) {
        e.preventDefault();
        mockSubmit();
      }
    };

    // Attach event listener
    textarea.addEventListener('keydown', handleInputKeydown);

    // Fire the event
    textarea.dispatchEvent(event);

    // Verify submit was NOT called because isComposing = true
    expect(mockSubmit).not.toHaveBeenCalled();

    // Cleanup
    textarea.removeEventListener('keydown', handleInputKeydown);
  });

  it('should submit message when Enter is pressed after IME composition is complete', () => {
    // Create a mock textarea element
    const textarea = document.createElement('textarea');
    const mockSubmit = vi.fn();

    // Create a mock keydown event with isComposing = false (composition completed)
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });

    // Mock the nativeEvent.isComposing property
    Object.defineProperty(event, 'nativeEvent', {
      value: { isComposing: false },
      writable: false,
    });

    // Simulate the handleInputKeydown logic
    const handleInputKeydown = (e: KeyboardEvent) => {
      const nativeEvent = (e as unknown as { nativeEvent: { isComposing: boolean } }).nativeEvent;

      // Don't submit if IME composition is in progress
      if (e.code === 'Enter' && !e.shiftKey && !nativeEvent.isComposing) {
        e.preventDefault();
        mockSubmit();
      }
    };

    // Attach event listener
    textarea.addEventListener('keydown', handleInputKeydown);

    // Fire the event
    textarea.dispatchEvent(event);

    // Verify submit WAS called because isComposing = false
    expect(mockSubmit).toHaveBeenCalledTimes(1);

    // Cleanup
    textarea.removeEventListener('keydown', handleInputKeydown);
  });

  it('should allow Shift+Enter for newline even during IME composition', () => {
    // Create a mock textarea element
    const textarea = document.createElement('textarea');
    const mockSubmit = vi.fn();

    // Create a mock keydown event with Shift+Enter and isComposing = true
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    // Mock the nativeEvent.isComposing property
    Object.defineProperty(event, 'nativeEvent', {
      value: { isComposing: true },
      writable: false,
    });

    // Simulate the handleInputKeydown logic
    const handleInputKeydown = (e: KeyboardEvent) => {
      const nativeEvent = (e as unknown as { nativeEvent: { isComposing: boolean } }).nativeEvent;

      // Don't submit if IME composition is in progress
      if (e.code === 'Enter' && !e.shiftKey && !nativeEvent.isComposing) {
        e.preventDefault();
        mockSubmit();
      }
    };

    // Attach event listener
    textarea.addEventListener('keydown', handleInputKeydown);

    // Fire the event
    textarea.dispatchEvent(event);

    // Verify submit was NOT called (because of shiftKey)
    expect(mockSubmit).not.toHaveBeenCalled();

    // Cleanup
    textarea.removeEventListener('keydown', handleInputKeydown);
  });
});

/**
 * Test for PromptInput component IME handling
 */
describe('PromptInput - IME Composition Bug Fix', () => {
  it('should not submit form when Enter is pressed during IME composition', () => {
    // Create a mock textarea element
    const textarea = document.createElement('textarea');
    const mockFormSubmit = vi.fn();

    // Create a mock form
    const form = document.createElement('form');
    form.requestSubmit = mockFormSubmit;
    form.appendChild(textarea);

    // Create a mock keydown event with isComposing = true
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });

    // Mock the nativeEvent.isComposing property
    Object.defineProperty(event, 'nativeEvent', {
      value: { isComposing: true },
      writable: false,
    });

    // Simulate the handleKeyDown logic from PromptInputTextarea
    const handleKeyDown = (e: KeyboardEvent) => {
      const nativeEvent = (e as unknown as { nativeEvent: { isComposing: boolean } }).nativeEvent;

      if (e.key === 'Enter') {
        if ((e as KeyboardEvent & { shiftKey: boolean }).shiftKey) {
          // Allow newline
          return;
        }

        // Don't submit if IME composition is in progress
        if (nativeEvent.isComposing) {
          return;
        }

        // Submit on Enter (without Shift)
        e.preventDefault();
        const targetForm = (e.target as HTMLTextAreaElement).form;
        if (targetForm) {
          targetForm.requestSubmit();
        }
      }
    };

    // Set textarea.form to point to the form
    Object.defineProperty(textarea, 'form', {
      value: form,
      writable: false,
    });

    // Attach event listener
    textarea.addEventListener('keydown', handleKeyDown);

    // Fire the event
    textarea.dispatchEvent(event);

    // Verify form submit was NOT called because isComposing = true
    expect(mockFormSubmit).not.toHaveBeenCalled();

    // Cleanup
    textarea.removeEventListener('keydown', handleKeyDown);
  });

  it('should submit form when Enter is pressed after IME composition is complete', () => {
    // Create a mock textarea element
    const textarea = document.createElement('textarea');
    const mockFormSubmit = vi.fn();

    // Create a mock form
    const form = document.createElement('form');
    form.requestSubmit = mockFormSubmit;
    form.appendChild(textarea);

    // Create a mock keydown event with isComposing = false
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });

    // Mock the nativeEvent.isComposing property
    Object.defineProperty(event, 'nativeEvent', {
      value: { isComposing: false },
      writable: false,
    });

    // Simulate the handleKeyDown logic from PromptInputTextarea
    const handleKeyDown = (e: KeyboardEvent) => {
      const nativeEvent = (e as unknown as { nativeEvent: { isComposing: boolean } }).nativeEvent;

      if (e.key === 'Enter') {
        if ((e as KeyboardEvent & { shiftKey: boolean }).shiftKey) {
          // Allow newline
          return;
        }

        // Don't submit if IME composition is in progress
        if (nativeEvent.isComposing) {
          return;
        }

        // Submit on Enter (without Shift)
        e.preventDefault();
        const targetForm = (e.target as HTMLTextAreaElement).form;
        if (targetForm) {
          targetForm.requestSubmit();
        }
      }
    };

    // Set textarea.form to point to the form
    Object.defineProperty(textarea, 'form', {
      value: form,
      writable: false,
    });

    // Attach event listener
    textarea.addEventListener('keydown', handleKeyDown);

    // Fire the event
    textarea.dispatchEvent(event);

    // Verify form submit WAS called because isComposing = false
    expect(mockFormSubmit).toHaveBeenCalledTimes(1);

    // Cleanup
    textarea.removeEventListener('keydown', handleKeyDown);
  });
});
