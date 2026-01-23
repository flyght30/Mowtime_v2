/**
 * Add Technician Page
 * Form to create a new technician
 */

import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';
import { techniciansApi, TechnicianCreate } from '../../services/dispatchApi';
import TechForm from '../../components/technicians/TechForm';

export default function AddTechnicianScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: TechnicianCreate) => {
    setLoading(true);
    try {
      const response = await techniciansApi.create(data);
      if (response.success) {
        router.back();
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to create technician');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <TechForm onSubmit={handleSubmit} onCancel={handleCancel} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
