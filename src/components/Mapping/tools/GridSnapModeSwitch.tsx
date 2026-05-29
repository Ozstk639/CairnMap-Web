import { useEffect, useMemo, useState } from 'react';
import AppButton from '@/components/ui/AppButton';
import {
  getGridSnapMode,
  setGridSnapMode,
  subscribeGridSnapMode,
  type GridSnapMode,
} from '@/lib/gridSnapUtils';
export {
  MANUAL_COORD_STEP,
  formatGridNumber,
  getGridSnapMode,
  parseHalfStepNumber,
  parseStepNumber,
  roundToStepStable,
  setGridSnapMode,
  snapNumberByMode,
  snapWorldPointByMode,
  stepToDecimals,
  type GridSnapMode,
  type WorldPoint,
} from '@/lib/gridSnapUtils';

export const useGridSnapMode = (): [GridSnapMode, (m: GridSnapMode) => void] => {
  const [mode, setMode] = useState<GridSnapMode>(getGridSnapMode());

  useEffect(() => subscribeGridSnapMode((m) => setMode(m)), []);

  return [mode, setGridSnapMode];
};

export default function GridSnapModeSwitch() {
  const [mode, setMode] = useGridSnapMode();

  const centerOn = mode === 'center';
  const edgeOn = mode === 'edge';

  const btnBase =
    'flex-1 px-2 py-1 rounded text-sm border transition-colors select-none';
  const onCls = 'bg-blue-600 text-white border-blue-700';
  const offCls = 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50';

  const toggleCenter = () => {
    if (centerOn) setMode('auto');
    else setMode('center');
  };

  const toggleEdge = () => {
    if (edgeOn) setMode('auto');
    else setMode('edge');
  };

  const hint = useMemo(() => {
    if (mode === 'center') return '当前：强制中心（k+0.5）';
    if (mode === 'edge') return '当前：强制边缘（整数）';
    return '当前：自动（0.5 步进）';
  }, [mode]);

  return (
    <div className="flex gap-2" title={hint}>
      <AppButton type="button" className={`${btnBase} ${centerOn ? onCls : offCls}`} onClick={toggleCenter}>
        方块中心(.5)
      </AppButton>
      <AppButton type="button" className={`${btnBase} ${edgeOn ? onCls : offCls}`} onClick={toggleEdge}>
        方块边缘(.0)
      </AppButton>
    </div>
  );
}
