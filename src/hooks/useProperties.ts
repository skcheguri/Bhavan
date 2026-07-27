import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';

export interface PropertyFromDB {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  city: string | null;
  total_units: number | null;
  occupied_units: number | null;
  monthly_income: number | null;
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

  return { properties, loading, error, refresh: fetchProperties };
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