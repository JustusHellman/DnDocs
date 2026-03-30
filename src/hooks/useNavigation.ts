import { useNavigate } from 'react-router-dom';
import { useTabActions } from '../contexts/TabContext';
import { Entity } from '../types';
import { useCallback } from 'react';

export function useNavigation() {
  const navigate = useNavigate();
  const { openTab } = useTabActions();

  const navigateToEntity = useCallback((entity: Entity) => {
    openTab(entity.id, entity.name, entity.type);
  }, [openTab]);

  return { navigateToEntity };
}
