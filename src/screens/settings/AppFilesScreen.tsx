import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getLocalProjetos } from '../../database/db';
import {
  getProjectsFoldersSummary,
  openRootFolderExternally,
  ensureAllProjectsFolders,
  getAppFilesRootDir,
  ProjectFolderSummary,
} from '../../services/appFilesService';
import { Projeto } from '../../types';

export default function AppFilesScreen() {
  const navigation = useNavigation<any>();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [folders, setFolders] = useState<ProjectFolderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [basePath, setBasePath] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [projs, dirs, path] = await Promise.all([
        getLocalProjetos(),
        getProjectsFoldersSummary(),
        getAppFilesRootDir(),
      ]);
      setProjetos(projs);
      setFolders(dirs);
      setBasePath(path);
    } catch (error) {
      console.error('Erro ao listar arquivos do app:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncAllFolders = async () => {
    try {
      setSyncing(true);
      await ensureAllProjectsFolders();
      await loadData();
      Alert.alert(
        'Pastas Criadas com Sucesso',
        'Todas as pastas locais das obras foram verificadas e espelhadas na raiz de documentos do seu celular (/Documents/ELP_Arquivos/).'
      );
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível criar as pastas das obras.');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenExternal = async () => {
    try {
      await openRootFolderExternally();
    } catch (error) {
      Alert.alert('Aviso', 'Não foi possível abrir o gerenciador automaticamente.');
    }
  };

  const renderItem = ({ item }: { item: Projeto }) => {
    const projFolder = folders.find((f) => 
      f.projectName.toLowerCase().includes(item.nome.toLowerCase()) ||
      item.nome.toLowerCase().includes(f.projectName.toLowerCase())
    );
    const imgCount = projFolder?.imagens?.length ?? 0;
    const pdfCount = projFolder?.pdfs?.length ?? 0;

    return (
      <View style={styles.card}>
        <View style={styles.folderIconWrap}>
          <Ionicons name="folder" size={28} color="#F59E0B" />
        </View>

        <View style={styles.infoCol}>
          <Text style={styles.projectName} numberOfLines={1}>
            {item.numero ? `[${item.numero}] ` : ''}{item.nome}
          </Text>
          <Text style={styles.projectClient} numberOfLines={1}>
            {item.construtora || 'ObraFlow'} • {item.tipo_obra || 'Edificação'}
          </Text>

          <View style={styles.subfolderTags}>
            <View style={styles.subfolderTag}>
              <Ionicons name="images-outline" size={13} color="#2563EB" />
              <Text style={styles.subfolderTagText}>imagens/ ({imgCount})</Text>
            </View>
            <View style={styles.subfolderTag}>
              <Ionicons name="document-text-outline" size={13} color="#DC2626" />
              <Text style={styles.subfolderTagText}>relatorios_pdf/ ({pdfCount})</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Arquivos do App</Text>
          <Text style={styles.headerSubtitle}>Armazenamento local das obras</Text>
        </View>
      </View>

      {/* Path Card */}
      <View style={styles.pathCard}>
        <View style={styles.pathHeader}>
          <Ionicons name="phone-portrait-outline" size={18} color="#0284C7" />
          <Text style={styles.pathTitle}>Diretório no Armazenamento do Dispositivo</Text>
        </View>
        <Text style={styles.pathText} selectable>
          {basePath || 'Carregando diretório...'}
        </Text>
        <Text style={styles.pathSubtext}>
          Acessível através do aplicativo nativo "Meus Arquivos" ou "Files" do seu celular em Documentos &gt; ELP_Arquivos.
        </Text>

        <TouchableOpacity style={styles.openExternalBtn} onPress={handleOpenExternal}>
          <Ionicons name="open-outline" size={18} color="#FFFFFF" />
          <Text style={styles.openExternalBtnText}>Abrir no Gerenciador de Arquivos</Text>
        </TouchableOpacity>
      </View>

      {/* Subheader & Sync Button */}
      <View style={styles.listHeaderRow}>
        <Text style={styles.sectionTitle}>
          Pastas por Obra ({projetos.length})
        </Text>
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={handleSyncAllFolders}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <>
              <Ionicons name="sync" size={14} color="#2563EB" />
              <Text style={styles.syncBtnText}>Atualizar Pastas</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Carregando pastas das obras...</Text>
        </View>
      ) : (
        <FlatList
          data={projetos}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Nenhuma obra cadastrada</Text>
              <Text style={styles.emptyText}>
                As pastas são criadas automaticamente para cada nova obra.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  pathCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  pathHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  pathTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  pathText: {
    fontSize: 12,
    color: '#0284C7',
    backgroundColor: '#F0F9FF',
    padding: 8,
    borderRadius: 6,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  pathSubtext: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 12,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  openExternalBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  syncBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  folderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoCol: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  projectClient: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 6,
  },
  subfolderTags: {
    flexDirection: 'row',
    gap: 8,
  },
  subfolderTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  subfolderTagText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
});
