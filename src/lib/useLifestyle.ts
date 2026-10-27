import { useEffect, useState } from 'react';
import { lifestyleStore, LifestyleState } from './lifestyleStore';
import { ScoringContext } from './habitScoring';

export interface UseLifestyleResult {
  state: LifestyleState;
  scoringContext: ScoringContext;
  store: typeof lifestyleStore;
}

export function useLifestyle(userId: string | null): UseLifestyleResult {
  const [state, setState] = useState<LifestyleState>(lifestyleStore.getState());

  useEffect(() => {
    if (userId) {
      lifestyleStore.loadAll(userId);
    }
    const unsubscribe = lifestyleStore.subscribe(() => {
      setState(lifestyleStore.getState());
    });
    return unsubscribe;
  }, [userId]);

  return {
    state,
    scoringContext: lifestyleStore.getScoringContext(),
    store: lifestyleStore,
  };
}
