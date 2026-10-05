import { GiDiceTwentyFacesTwenty, GiMeepleGroup, GiOpenBook, GiScrollUnfurled, GiStack, GiTreasureMap } from 'react-icons/gi';
import type { EntityIcon } from '../../lib/entityTypes';
import { menuTypes, TYPE_META } from '../../lib/entityTypes';
import type { EntityType } from '../../types';

export interface NavItem {
  to: string;
  label: string;
  icon: EntityIcon;
  type?: EntityType;
  dmOnly?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const t = (type: EntityType): NavItem => ({
  to: `/entities/${type}`,
  label: TYPE_META[type].plural,
  icon: TYPE_META[type].icon,
  type,
});

const GROUPS = ['Adventure', 'Characters', 'World'] as const;

/** Built from the type registry each time, so the campaign's own types show up. */
export function navGroups(): NavGroup[] {
  return [
    {
      items: [
        { to: '/search', label: 'Home', icon: GiOpenBook },
        { to: '/map', label: 'World map', icon: GiTreasureMap },
        { to: '/chronicle', label: 'Chronicle', icon: GiScrollUnfurled },
      ],
    },
    ...GROUPS.map((label) => {
      let types = menuTypes().filter((ty) => ty.group === label);
      // Places from largest to smallest.
      if (label === 'World') types = [...types].sort((a, b) => b.level - a.level);
      return { label, items: types.map((ty) => t(ty.value)) };
    }),
    {
      label: 'Table',
      items: [
        { to: '/players', label: 'Members', icon: GiMeepleGroup },
        { to: '/tools', label: 'DM tools', icon: GiDiceTwentyFacesTwenty, dmOnly: true },
        { to: '/types', label: 'Entry types', icon: GiStack, dmOnly: true },
      ],
    },
  ];
}
