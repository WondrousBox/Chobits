import type { InstanceRow } from '../hooks/useProvidersInstances';
import ServicePresetSelect, { type ServicePresetSelectProps } from './ServicePresetSelect';

export interface ServiceInstanceSelectProps {
  providerId?: string;
  presetId?: string;
  instanceId?: string;
  onChange: (providerId: string, presetId: string) => void;
  className?: string;
  buttonVariant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  placeholder?: string;
  searchEnabled?: boolean;
  orderPresets?: (presets: InstanceRow[], providerId: string) => InstanceRow[];
  orderInstances?: (instances: InstanceRow[], providerId: string) => InstanceRow[];
  onOpenChange?: (open: boolean) => void;
}

/**
 * Compatibility wrapper around ServicePresetSelect.
 * Keep accepting instance-shaped props while the app finishes migrating to preset terminology.
 */
export default function ServiceInstanceSelect(props: ServiceInstanceSelectProps): JSX.Element {
  const { instanceId, orderInstances, orderPresets, presetId, ...rest } = props;
  return <ServicePresetSelect {...(rest as ServicePresetSelectProps)} presetId={presetId ?? instanceId} orderPresets={orderPresets ?? orderInstances} />;
}
