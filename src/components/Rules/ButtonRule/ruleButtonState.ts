import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_ACTIVE_RULE_BUTTONS_BY_WORLD,
  DEFAULT_ACTIVE_RULE_BUTTONS_FALLBACK,
  RULE_BUTTON_DEFS,
  RULE_BUTTON_POLICY,
  RULE_BUTTON_STATE_LEGACY_STORAGE_KEYS,
  RULE_BUTTON_STATE_STORAGE_KEY,
} from './buttonRuleConfig';

export type RuleButtonState = {
  /** 以“启用顺序”存储的 active id 列表（用于 maxActive 的淘汰策略） */
  activeOrdered: string[];
};

function uniqKeepOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const k = String(v ?? '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function getDefaultActive(worldId: string): string[] {
  const byWorld = DEFAULT_ACTIVE_RULE_BUTTONS_BY_WORLD[String(worldId)];
  return uniqKeepOrder(byWorld ?? DEFAULT_ACTIVE_RULE_BUTTONS_FALLBACK);
}

function parseStorageValue(raw: string | null): Record<string, RuleButtonState> | null {
  try {
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj as Record<string, RuleButtonState>;
  } catch {
    return null;
  }
}

function readStorage(): Record<string, RuleButtonState> {
  const storageKeys = uniqKeepOrder([RULE_BUTTON_STATE_STORAGE_KEY, ...RULE_BUTTON_STATE_LEGACY_STORAGE_KEYS]);

  try {
    for (const key of storageKeys) {
      const parsed = parseStorageValue(localStorage.getItem(key));
      if (!parsed) continue;

      if (key !== RULE_BUTTON_STATE_STORAGE_KEY) {
        try {
          localStorage.setItem(RULE_BUTTON_STATE_STORAGE_KEY, JSON.stringify(parsed));
        } catch {
          // ignore migration write errors
        }
      }
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function writeStorage(obj: Record<string, RuleButtonState>) {
  try {
    localStorage.setItem(RULE_BUTTON_STATE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function getDef(id: string) {
  return RULE_BUTTON_DEFS.find((d) => d.id === id) || null;
}

function getExclusiveIdsFor(defId: string): Set<string> {
  const def = getDef(defId);
  const out = new Set<string>();
  if (!def) return out;

  for (const id of def.exclusiveWith ?? []) {
    const key = String(id ?? '').trim();
    if (key) out.add(key);
  }

  const group = String(def.behavior?.exclusiveGroup ?? '').trim();
  if (group) {
    for (const other of RULE_BUTTON_DEFS) {
      if (other.id === defId) continue;
      const otherGroup = String(other.behavior?.exclusiveGroup ?? '').trim();
      if (otherGroup === group) out.add(other.id);
    }
  }

  return out;
}

function applyLinkedButtonEffects(list: string[], toggledId: string, isTurningOn: boolean): string[] {
  const def = getDef(toggledId);
  if (!def) return list;

  let next = [...list];

  if (isTurningOn) {
    for (const id of def.behavior?.disableWhenEnabled ?? []) {
      const key = String(id ?? '').trim();
      if (key) next = next.filter((item) => item !== key);
    }
    for (const id of def.behavior?.enableWhenEnabled ?? []) {
      const key = String(id ?? '').trim();
      if (key && !next.includes(key)) next.push(key);
    }
  }

  for (const linked of def.behavior?.linkedButtons ?? []) {
    const targetId = String(linked?.targetId ?? '').trim();
    if (!targetId) continue;

    if (linked.mode === 'enableWhenThisEnabled' && isTurningOn) {
      if (!next.includes(targetId)) next.push(targetId);
    }

    if (linked.mode === 'disableWhenThisEnabled' && isTurningOn) {
      next = next.filter((item) => item !== targetId);
    }

    if (linked.mode === 'mirrorThisState') {
      if (isTurningOn) {
        if (!next.includes(targetId)) next.push(targetId);
      } else {
        next = next.filter((item) => item !== targetId);
      }
    }
  }

  return next;
}

function applyMaxActivePolicy(list: string[]): string[] {
  const max = Number(RULE_BUTTON_POLICY.maxActive ?? 0);
  if (Number.isFinite(max) && max > 0 && list.length > max) {
    return list.slice(list.length - max);
  }
  return list;
}

/**
 * 规则按钮状态：
 * - worldId 维度存储（不同世界可不同组合）
 * - 支持互斥规则（exclusiveWith / exclusiveGroup）
 * - 支持轻量联动规则（linkedButtons / enableWhenEnabled / disableWhenEnabled）
 * - 支持最大开启数（maxActive）
 * - 支持从 legacy localStorage key 迁移
 */
export function useRuleButtonState(worldId: string) {
  const wid = String(worldId ?? '').trim() || 'default';

  const [state, setState] = useState<RuleButtonState>(() => ({
    activeOrdered: getDefaultActive(wid),
  }));

  // load from localStorage when world changes
  useEffect(() => {
    const all = readStorage();
    const next = all[wid];
    if (next && Array.isArray(next.activeOrdered)) {
      setState({ activeOrdered: uniqKeepOrder(next.activeOrdered) });
    } else {
      setState({ activeOrdered: getDefaultActive(wid) });
    }
  }, [wid]);

  // persist
  useEffect(() => {
    const all = readStorage();
    all[wid] = state;
    writeStorage(all);
  }, [wid, state]);

  const activeSet = useMemo(() => new Set(state.activeOrdered), [state.activeOrdered]);

  const toggle = useCallback((id: string) => {
    const key = String(id ?? '').trim();
    if (!key) return;

    setState((prev) => {
      const cur = uniqKeepOrder(prev.activeOrdered);
      const isOn = cur.includes(key);

      // OFF: remove + apply mirror linked effects
      if (isOn) {
        const removed = cur.filter((x) => x !== key);
        return { activeOrdered: uniqKeepOrder(applyLinkedButtonEffects(removed, key, false)) };
      }

      // ON: add + apply exclusives + linked rules + maxActive
      let next = [...cur, key];

      const exclusiveIds = getExclusiveIdsFor(key);
      if (exclusiveIds.size > 0) {
        next = next.filter((x) => !exclusiveIds.has(x));
        // ensure the toggled key stays
        if (!next.includes(key)) next.push(key);
      }

      next = applyLinkedButtonEffects(next, key, true);
      next = uniqKeepOrder(next);
      next = applyMaxActivePolicy(next);

      return { activeOrdered: next };
    });
  }, []);

  const activeButtonIds = useMemo(() => state.activeOrdered, [state.activeOrdered]);

  return {
    activeButtonIds,
    activeSet,
    toggle,
  };
}
