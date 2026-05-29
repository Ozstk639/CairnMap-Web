import type React from 'react';
import { Building2, Home, Leaf, Map, Route, ShoppingCart, Train, Zap } from 'lucide-react';

const ICON_CLASS_NAME = 'w-5 h-5';

/**
 * Converts configuration-level icon keys into runtime React icons.
 * JSON config must only store iconKey strings; React components stay in TS/TSX.
 */
export function resolveRuleButtonIcon(iconKey: string): React.ReactNode {
  switch (String(iconKey ?? '').trim()) {
    case 'train':
      return <Train className={ICON_CLASS_NAME} />;
    case 'route':
      return <Route className={ICON_CLASS_NAME} />;
    case 'leaf':
      return <Leaf className={ICON_CLASS_NAME} />;
    case 'home':
      return <Home className={ICON_CLASS_NAME} />;
    case 'map':
      return <Map className={ICON_CLASS_NAME} />;
    case 'zap':
      return <Zap className={ICON_CLASS_NAME} />;
    case 'shoppingCart':
      return <ShoppingCart className={ICON_CLASS_NAME} />;
    case 'building2':
      return <Building2 className={ICON_CLASS_NAME} />;
    default:
      return <Map className={ICON_CLASS_NAME} />;
  }
}
