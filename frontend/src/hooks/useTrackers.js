import { useState, useEffect } from 'react';
import { trackerService } from '../services/trackerService';

/**
 * Custom hook to fetch and manage trackers
 */
export const useTrackers = () => {
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTrackers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await trackerService.getMyTrackers();
      setTrackers(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load trackers');
      console.error('Error fetching trackers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackers();
  }, []);

  return {
    trackers,
    loading,
    error,
    refetch: fetchTrackers,
  };
};

