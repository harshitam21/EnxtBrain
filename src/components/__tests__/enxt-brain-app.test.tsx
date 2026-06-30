import { describe } from 'node:test';
import { paymentHistoryTotalPaid, getProjectStatusTone } from '../enxt-brain-app';

describe('enxt-brain-app utility functions', () => {
  describe('paymentHistoryTotalPaid', () => {
    it('calculates the total amount from a list of payments', () => {
      const history = [
        { date: '2026-01-01', amount: '5000', notes: '' },
        { date: '2026-02-01', amount: '10,000', notes: '' },
      ];
      expect(paymentHistoryTotalPaid(history)).toBe(15000);
    });

    it('returns 0 for an empty history', () => {
      expect(paymentHistoryTotalPaid([])).toBe(0);
    });
  });

  describe('getProjectStatusTone', () => {
    it('returns green for Pilot and QA', () => {
      expect(getProjectStatusTone('Pilot')).toBe('green');
      expect(getProjectStatusTone('QA')).toBe('green');
    });

    it('returns neutral for Planning', () => {
      expect(getProjectStatusTone('Planning')).toBe('neutral');
    });
  });
});
