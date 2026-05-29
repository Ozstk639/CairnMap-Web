import { getDisplayAlgorithmByKey, isDisplayAlgorithmAllowedForClass } from './displayAlgorithmMetadata';

export type CairnMapDisplayAlgorithmResolution = {
  key: string;
  registered: boolean;
  allowedForClass: boolean;
  runtimeStatus?: string;
};

export function resolveDisplayAlgorithmForClass(
  key: string,
  classCode: string,
): CairnMapDisplayAlgorithmResolution {
  const algorithm = getDisplayAlgorithmByKey(key);
  return {
    key,
    registered: Boolean(algorithm),
    allowedForClass: algorithm ? isDisplayAlgorithmAllowedForClass(key, classCode) : false,
    runtimeStatus: algorithm?.runtimeStatus,
  };
}

export function resolveDisplayAlgorithmsForClass(
  keys: string[],
  classCode: string,
): CairnMapDisplayAlgorithmResolution[] {
  return keys.map((key) => resolveDisplayAlgorithmForClass(key, classCode));
}
