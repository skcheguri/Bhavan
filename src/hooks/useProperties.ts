import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';

/**
 * What a flat is for. A fact about the flat, not about its owner: the
 * common case is somebody who lives in one and rents out another, so
 * asking the person would be wrong for half their properties.
 *
 * rented_out is set by the database whenever a rental agreement is live
 * and cannot be overridden while it stays live -- see migration 101.
 */
export type PropertyOccupancy = 'self_occupied' | 'rented_out' | 'vacant';

export const OCCUPANCY_LABELS: Record<PropertyOccupancy, string> = {
  self_occupied: 'I live here',
  rented_out: 'Rented out',
  vacant: 'Empty',
};

export interface PropertyFromDB {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  city: string | null;
  total_units: number | null;
  occupancy: PropertyOccupancy;
  verified: boolean | null;
  created_at: string;
}

export interface UnitFromDB {
  id: string;
  property_id: string;
  unit_number: string;
  rent_amount: number | null;
  maintenance_charge: number | null;
  status: 'vacant' | 'occupied' | 'under_maintenance' | null;
  tenant_id: string | null;
  tenant_name: string | null;
  lease_start: string | null;
  lease_end: string | null;
  agreement_generated: boolean | null;
  last_payment_status: string | null;
}

interface UsePropertiesReturn {
  properties: PropertyFromDB[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setOccupancy: (propertyId: string, occupancy: PropertyOccupancy) => Promise<string | null>;
}

export function useProperties(ownerId: string | undefined): UsePropertiesReturn {
  const [properties, setProperties] = useState<PropertyFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProperties = useCallback(async () => {
    if (!isSupabaseConnected() || !ownerId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('properties')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setProperties([]);
    } else {
      setProperties((data as PropertyFromDB[]) ?? []);
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  /**
   * The database refuses to let a flat with a live agreement be called
   * anything but rented, and says so in the error -- that message is
   * more useful to the owner than anything this hook could invent, so
   * it is passed through untouched.
   */
  const setOccupancy = useCallback(
    async (propertyId: string, occupancy: PropertyOccupancy): Promise<string | null> => {
      const supabase = getSupabase();
      if (!supabase) return 'Database connection unavailable';

      const { error: dbError } = await supabase
        .from('properties')
        .update({ occupancy })
        .eq('id', propertyId);

      if (dbError) return dbError.message;
      await fetchProperties();
      return null;
    },
    [fetchProperties]
  );

  return { properties, loading, error, refresh: fetchProperties, setOccupancy };
}

export function usePropertyUnits(propertyId: string | undefined): {
  units: UnitFromDB[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [units, setUnits] = useState<UnitFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUnits = useCallback(async () => {
    if (!isSupabaseConnected() || !propertyId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('units')
      .select('*')
      .eq('property_id', propertyId)
      .order('unit_number', { ascending: true });

    if (dbError) {
      setError(dbError.message);
      setUnits([]);
    } else {
      setUnits((data as UnitFromDB[]) ?? []);
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  return { units, loading, error, refresh: fetchUnits };
}

export async function createProperty(propertyData: {
  owner_id: string;
  name: string;
  address: string;
  city?: string;
  verified?: boolean;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: 'Supabase not connected' };

  const { data, error } = await supabase
    .from('properties')
    .insert(propertyData)
    .select('id')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}