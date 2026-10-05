import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalVisitaById, saveLocalVisita, addToSyncQueue } from '../../database/db';
import { useNetwork } from '../../contexts/NetworkContext';
import { Visita } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const VisitDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { visitId } = route.params;
  const { isOnline, triggerSync } = useNetwork();
  const [visita, setVisita] = useState<Visita | null>(null);

  useEffect(() => {
    loadVisit();
  }, [visitId]);

  async function loadVisit() {
    try {
      const v = await getLocalVisitaById(visitId);
      setVisita(v);
    } catch (e) {
      console.warn('Erro ao carregar visita:', e);
    }
  }

  async function handleMarkRealizada() {
    if (!visita) return;
    try {
      const updated: Visita = {
        ...visita,
        status: 'Realizada',
        data_realizada: new Date().toISOString(),
        sync_status: 'pending',
      };
      await saveLocalVisita(updated, 'pending');
      await addToSyncQueue(
        'visita',
        updated.id,
        'update',
        `/api/visits/${updated.id}`,
        'PUT',
        updated
      );
      if (isOnline) triggerSync();
      setVisita(updated);
      Alert.alert('Sucesso', 'Visita marcada como Realizada!');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  }

  if (!visita) {
    return (
      <View style={styles.container}>
        <Header title="Detalhes da Visita" showBack onBack={() => navigation.goBack()} />
        <View style={styles.center}><Text>Carregando...</Text></View>
      </View>
    );
  }

  const dateObj = new Date(visita.data_inicio);

  return (
    <View style={styles.container}>
      <Header 
        title={visita.numero} 
        subtitle={visita.projeto_nome || 'Visita'}
        showBack 
        onBack={() => navigation.goBack()} 
      />
      <OfflineBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Dados do Agendamento</Text>
            <SyncStatusBadge status={visita.sync_status} />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Obra:</Text>
            <Text style={styles.value}>{visita.projeto_nome || visita.projeto_outros || 'Outros'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Data & Horário:</Text>
            <Text style={styles.value}>
              {dateObj.toLocaleDateString('pt-BR')} às {dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Responsável:</Text>
            <Text style={styles.value}>{visita.responsavel_nome || 'Não informado'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Status:</Text>
            <Text style={[styles.value, { fontWeight: 'bold', color: Colors.primary }]}>{visita.status}</Text>
          </View>

          {visita.observacoes ? (
            <View style={styles.obsBox}>
              <Text style={styles.obsTitle}>Objetivo / Observações:</Text>
              <Text style={styles.obsText}>{visita.observacoes}</Text>
            </View>
          ) : null}

          {visita.atividades_realizadas ? (
            <View style={styles.obsBox}>
              <Text style={styles.obsTitle}>Atividades Realizadas:</Text>
              <Text style={styles.obsText}>{visita.atividades_realizadas}</Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons */}
        <TouchableOpacity 
          style={[styles.btn, { backgroundColor: Colors.primary }]}
          onPress={() => navigation.navigate('ReportFormScreen', { 
            preSelectedProjectId: visita.projeto_id,
            preSelectedVisitId: visita.id 
          })}
        >
          <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
          <Text style={styles.btnText}>Criar Relatório Desta Visita</Text>
        </TouchableOpacity>

        {visita.status !== 'Realizada' && (
          <TouchableOpacity 
            style={[styles.btn, { backgroundColor: '#10B981', marginTop: 10 }]}
            onPress={handleMarkRealizada}
          >
            <Ionicons name="checkmark-done-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>Concluir e Marcar Como Realizada</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  label: { fontSize: 13, color: Colors.textSecondary },
  value: { fontSize: 13, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  obsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  obsTitle: { fontSize: 12, fontWeight: 'bold', color: '#334155', marginBottom: 4 },
  obsText: { fontSize: 13, color: '#475569', lineHeight: 18 },
  btn: {
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.sm,
  },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
});
