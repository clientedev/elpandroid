import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, Image, 
  TextInput, Dimensions, Alert, ScrollView, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = Math.min(SCREEN_WIDTH - 24, 380);

export interface AnnotationItem {
  id: string;
  type: 'arrow' | 'rect' | 'circle' | 'text';
  x: number;          // percent 0 - 100
  y: number;          // percent 0 - 100
  size: number;       // scale / size in pixels (e.g. 25 to 150)
  rotation?: number;  // angle in degrees (0, 45, 90, 135, 180, 225, 270, 315)
  text?: string;
  color: string;
}

interface PhotoEditorModalProps {
  visible: boolean;
  photoUri: string | null;
  initialAnnotations?: string; // JSON string
  onClose: () => void;
  onSave: (annotationsJson: string) => void;
}

const COLOR_PALETTE = [
  '#EF4444', // Vermelho (Alerta / Fissura)
  '#F59E0B', // Amarelo (Atenção)
  '#10B981', // Verde (Conforme)
  '#3B82F6', // Azul (Infiltração / Ponto)
  '#FFFFFF', // Branco
  '#000000', // Preto
];

const QUICK_TEXT_TAGS = [
  'Fissura',
  'Infiltração',
  'Destacamento',
  'Armadura Exposta',
  'Desaprumo',
  'Falha de Rejunte',
  'Peitoril Danificado',
  'OK / Conforme'
];

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({
  visible,
  photoUri,
  initialAnnotations,
  onClose,
  onSave,
}) => {
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [selectedTool, setSelectedTool] = useState<'arrow' | 'rect' | 'circle' | 'text'>('arrow');
  const [selectedColor, setSelectedColor] = useState('#EF4444');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [textInputVal, setTextInputVal] = useState('Fissura');
  const [showTextInputModal, setShowTextInputModal] = useState(false);
  const [pendingTextPos, setPendingTextPos] = useState<{ x: number; y: number } | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      setImageError(false);
      setImageLoading(true);
      if (initialAnnotations) {
        try {
          const parsed = typeof initialAnnotations === 'string' ? JSON.parse(initialAnnotations) : initialAnnotations;
          if (Array.isArray(parsed)) {
            // Ensure every item has size and rotation defaults
            const normalized = parsed.map((item, idx) => ({
              id: item.id || `item_${idx}_${Date.now()}`,
              type: item.type || 'arrow',
              x: typeof item.x === 'number' ? item.x : 50,
              y: typeof item.y === 'number' ? item.y : 50,
              size: item.size || 50,
              rotation: typeof item.rotation === 'number' ? item.rotation : 45,
              text: item.text || '',
              color: item.color || '#EF4444',
            }));
            setAnnotations(normalized);
            setSelectedId(normalized.length > 0 ? normalized[normalized.length - 1].id : null);
          } else {
            setAnnotations([]);
            setSelectedId(null);
          }
        } catch {
          setAnnotations([]);
          setSelectedId(null);
        }
      } else {
        setAnnotations([]);
        setSelectedId(null);
      }
    }
  }, [visible, initialAnnotations, photoUri]);

  const selectedItem = annotations.find(a => a.id === selectedId) || null;

  function handleCanvasPress(e: any) {
    const { locationX, locationY } = e.nativeEvent;
    const xPct = Math.max(5, Math.min(95, (locationX / CANVAS_SIZE) * 100));
    const yPct = Math.max(5, Math.min(95, (locationY / CANVAS_SIZE) * 100));

    // Check if clicked near an existing annotation to select it
    const hitRadiusPct = 12;
    const hit = annotations.find(a => {
      const dx = Math.abs(a.x - xPct);
      const dy = Math.abs(a.y - yPct);
      return dx < hitRadiusPct && dy < hitRadiusPct;
    });

    if (hit) {
      setSelectedId(hit.id);
      return;
    }

    // Otherwise create a new shape at clicked position
    if (selectedTool === 'text') {
      setPendingTextPos({ x: xPct, y: yPct });
      setShowTextInputModal(true);
      return;
    }

    const newItem: AnnotationItem = {
      id: Date.now().toString(),
      type: selectedTool,
      x: xPct,
      y: yPct,
      color: selectedColor,
      size: selectedTool === 'arrow' ? 48 : 55,
      rotation: selectedTool === 'arrow' ? 45 : 0,
    };

    setAnnotations(prev => [...prev, newItem]);
    setSelectedId(newItem.id);
  }

  function handleConfirmText() {
    if (pendingTextPos && textInputVal.trim()) {
      const newItem: AnnotationItem = {
        id: Date.now().toString(),
        type: 'text',
        x: pendingTextPos.x,
        y: pendingTextPos.y,
        size: 32,
        text: textInputVal.trim(),
        color: selectedColor,
      };
      setAnnotations(prev => [...prev, newItem]);
      setSelectedId(newItem.id);
    }
    setShowTextInputModal(false);
    setPendingTextPos(null);
  }

  // Dimensioning (Size adjustment)
  function adjustSelectedSize(delta: number) {
    if (!selectedId) return;
    setAnnotations(prev => prev.map(item => {
      if (item.id === selectedId) {
        const newSize = Math.max(20, Math.min(140, (item.size || 50) + delta));
        return { ...item, size: newSize };
      }
      return item;
    }));
  }

  function setSelectedSizePreset(presetSize: number) {
    if (!selectedId) return;
    setAnnotations(prev => prev.map(item => {
      if (item.id === selectedId) {
        return { ...item, size: presetSize };
      }
      return item;
    }));
  }

  // Arrow rotation (Direction adjustment)
  function rotateSelectedArrow(degrees = 45) {
    if (!selectedId) return;
    setAnnotations(prev => prev.map(item => {
      if (item.id === selectedId) {
        const curRot = item.rotation || 0;
        const nextRot = (curRot + degrees) % 360;
        return { ...item, rotation: nextRot };
      }
      return item;
    }));
  }

  function setArrowDirection(angle: number) {
    if (!selectedId) return;
    setAnnotations(prev => prev.map(item => {
      if (item.id === selectedId) {
        return { ...item, rotation: angle };
      }
      return item;
    }));
  }

  // Move selected shape
  function nudgeSelected(dx: number, dy: number) {
    if (!selectedId) return;
    setAnnotations(prev => prev.map(item => {
      if (item.id === selectedId) {
        return {
          ...item,
          x: Math.max(5, Math.min(95, item.x + dx)),
          y: Math.max(5, Math.min(95, item.y + dy)),
        };
      }
      return item;
    }));
  }

  // Delete selected item
  function deleteSelectedItem() {
    if (!selectedId) return;
    setAnnotations(prev => prev.filter(item => item.id !== selectedId));
    setSelectedId(null);
  }

  function handleUndo() {
    if (annotations.length === 0) return;
    setAnnotations(prev => prev.slice(0, prev.length - 1));
    setSelectedId(null);
  }

  function handleClearAll() {
    if (annotations.length === 0) return;
    Alert.alert('Limpar Todas', 'Deseja remover todas as marcações desta foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Limpar', 
        style: 'destructive', 
        onPress: () => {
          setAnnotations([]);
          setSelectedId(null);
        }
      },
    ]);
  }

  function handleSave() {
    onSave(JSON.stringify(annotations));
    onClose();
  }

  if (!visible) return null;

  // Resolve valid URI
  const resolvedPhotoUri = photoUri 
    ? (photoUri.startsWith('file://') || photoUri.startsWith('content://') || photoUri.startsWith('http')
        ? photoUri 
        : `https://elpandroid-production.up.railway.app${photoUri.startsWith('/') ? '' : '/'}${photoUri}`)
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
            <Text style={styles.headerBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Editor de Fotos & Formas</Text>
          <TouchableOpacity onPress={handleSave} style={[styles.headerBtn, styles.saveBtn]}>
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            <Text style={styles.headerBtnText}>Salvar</Text>
          </TouchableOpacity>
        </View>

        {/* Tip / Status Banner */}
        <View style={styles.tipBanner}>
          <Ionicons name="hand-right-outline" size={15} color="#38BDF8" />
          <Text style={styles.tipText}>
            {selectedItem 
              ? `Selecionado: ${selectedItem.type.toUpperCase()} • Use os botões abaixo para dimensionar ou girar.` 
              : `Toque na foto para inserir ${selectedTool === 'arrow' ? 'uma Seta' : selectedTool === 'rect' ? 'um Retângulo' : selectedTool === 'circle' ? 'um Círculo' : 'um Texto'}.`}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.mainScroll} showsVerticalScrollIndicator={false}>
          {/* Image Canvas */}
          <View style={styles.canvasContainer}>
            <TouchableOpacity 
              activeOpacity={1}
              onPress={handleCanvasPress}
              style={[styles.canvasBox, { width: CANVAS_SIZE, height: CANVAS_SIZE }]}
            >
              {resolvedPhotoUri ? (
                <Image 
                  source={{ uri: resolvedPhotoUri }} 
                  style={styles.image} 
                  resizeMode="contain"
                  onLoadStart={() => setImageLoading(true)}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => {
                    setImageError(true);
                    setImageLoading(false);
                  }}
                />
              ) : null}

              {imageLoading && (
                <View style={styles.imageLoadingOverlay}>
                  <ActivityIndicator size="small" color="#0284C7" />
                  <Text style={styles.loadingText}>Carregando foto...</Text>
                </View>
              )}

              {imageError && (
                <View style={styles.imageErrorOverlay}>
                  <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
                  <Text style={styles.errorText}>Não foi possível carregar a imagem prévia.</Text>
                </View>
              )}

              {/* Render Annotations */}
              {annotations.map(item => {
                const isSelected = item.id === selectedId;
                const size = item.size || 50;
                const rotation = item.rotation || 0;

                return (
                  <TouchableOpacity 
                    key={item.id} 
                    activeOpacity={0.8}
                    onPress={() => setSelectedId(item.id)}
                    style={[
                      styles.annotationWrapper, 
                      { 
                        left: `${item.x}%`, 
                        top: `${item.y}%`,
                        transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
                      },
                      isSelected && styles.annotationSelectedWrapper
                    ]}
                  >
                    {item.type === 'arrow' && (
                      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${rotation}deg` }] }}>
                        <Ionicons name="arrow-forward" size={size * 0.9} color={item.color} />
                      </View>
                    )}

                    {item.type === 'rect' && (
                      <View 
                        style={[
                          styles.rectShape, 
                          { 
                            borderColor: item.color, 
                            width: size * 1.3, 
                            height: size * 0.8,
                            borderWidth: Math.max(2.5, size * 0.05),
                            transform: [{ rotate: `${rotation}deg` }]
                          }
                        ]} 
                      />
                    )}

                    {item.type === 'circle' && (
                      <View 
                        style={[
                          styles.circleShape, 
                          { 
                            borderColor: item.color, 
                            width: size, 
                            height: size,
                            borderRadius: size / 2,
                            borderWidth: Math.max(2.5, size * 0.05),
                          }
                        ]} 
                      />
                    )}

                    {item.type === 'text' && (
                      <View style={[styles.textBadge, { backgroundColor: item.color }]}>
                        <Text style={[styles.badgeText, { color: item.color === '#FFFFFF' ? '#000000' : '#FFFFFF' }]}>
                          {item.text}
                        </Text>
                      </View>
                    )}

                    {/* Selection indicators */}
                    {isSelected && (
                      <View style={styles.selectionBorder}>
                        <View style={[styles.handleDot, styles.dotTL]} />
                        <View style={[styles.handleDot, styles.dotTR]} />
                        <View style={[styles.handleDot, styles.dotBL]} />
                        <View style={[styles.handleDot, styles.dotBR]} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </TouchableOpacity>

            {/* Quick Canvas Actions (Undo / Clear) */}
            <View style={styles.canvasActionsRow}>
              <TouchableOpacity style={styles.canvasActionBtn} onPress={handleUndo} disabled={annotations.length === 0}>
                <Ionicons name="arrow-undo-outline" size={16} color={annotations.length > 0 ? '#FFFFFF' : '#64748B'} />
                <Text style={[styles.canvasActionText, annotations.length === 0 && { color: '#64748B' }]}>Desfazer</Text>
              </TouchableOpacity>

              <Text style={styles.countBadgeText}>{annotations.length} marcação(ões)</Text>

              <TouchableOpacity style={styles.canvasActionBtn} onPress={handleClearAll} disabled={annotations.length === 0}>
                <Ionicons name="trash-outline" size={16} color={annotations.length > 0 ? '#EF4444' : '#64748B'} />
                <Text style={[styles.canvasActionText, { color: annotations.length > 0 ? '#EF4444' : '#64748B' }]}>Limpar Tudo</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Selected Item Control Panel (Dimensionamento e Rotação) */}
          {selectedItem ? (
            <View style={styles.selectedPanel}>
              <View style={styles.selectedHeaderRow}>
                <View style={styles.selectedTypeBox}>
                  <Ionicons 
                    name={selectedItem.type === 'arrow' ? 'arrow-redo' : selectedItem.type === 'rect' ? 'square-outline' : selectedItem.type === 'circle' ? 'ellipse-outline' : 'text'} 
                    size={16} 
                    color="#38BDF8" 
                  />
                  <Text style={styles.selectedTitle}>
                    Ajustar {selectedItem.type === 'arrow' ? 'Seta' : selectedItem.type === 'rect' ? 'Retângulo' : selectedItem.type === 'circle' ? 'Círculo' : 'Texto'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.deleteSelectedBtn} onPress={deleteSelectedItem}>
                  <Ionicons name="trash" size={15} color="#EF4444" />
                  <Text style={styles.deleteSelectedText}>Excluir</Text>
                </TouchableOpacity>
              </View>

              {/* 1. Dimensionamento (Tamanho) */}
              <Text style={styles.panelSubLabel}>Dimensionar Tamanho:</Text>
              <View style={styles.dimensionRow}>
                <TouchableOpacity style={styles.sizeBtn} onPress={() => adjustSelectedSize(-10)}>
                  <Ionicons name="remove" size={18} color="#FFFFFF" />
                  <Text style={styles.sizeBtnText}>Diminuir</Text>
                </TouchableOpacity>

                <View style={styles.sizePresetsBox}>
                  {[30, 50, 75, 105].map((s, idx) => (
                    <TouchableOpacity 
                      key={s} 
                      style={[styles.presetChip, (selectedItem.size || 50) === s && styles.presetChipActive]}
                      onPress={() => setSelectedSizePreset(s)}
                    >
                      <Text style={[styles.presetChipText, (selectedItem.size || 50) === s && styles.presetChipTextActive]}>
                        {idx === 0 ? 'P' : idx === 1 ? 'M' : idx === 2 ? 'G' : 'GG'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.sizeBtn} onPress={() => adjustSelectedSize(10)}>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.sizeBtnText}>Aumentar</Text>
                </TouchableOpacity>
              </View>

              {/* 2. Rotação / Direção (apenas para Setas e Retângulos) */}
              {(selectedItem.type === 'arrow' || selectedItem.type === 'rect') && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.panelSubLabel}>Direção / Rotação:</Text>
                  <View style={styles.directionRow}>
                    <TouchableOpacity style={styles.dirBtn} onPress={() => rotateSelectedArrow(45)}>
                      <Ionicons name="refresh" size={16} color="#FFFFFF" />
                      <Text style={styles.dirBtnText}>Girar 45°</Text>
                    </TouchableOpacity>
                    {[
                      { label: '⬆️', angle: 270 },
                      { label: '↗️', angle: 315 },
                      { label: '➡️', angle: 0 },
                      { label: '↘️', angle: 45 },
                      { label: '⬇️', angle: 90 },
                      { label: '↙️', angle: 135 },
                      { label: '⬅️', angle: 180 },
                      { label: '↖️', angle: 225 },
                    ].map(d => (
                      <TouchableOpacity 
                        key={d.angle}
                        style={[styles.dirIconBtn, (selectedItem.rotation || 0) === d.angle && styles.dirIconBtnActive]}
                        onPress={() => setArrowDirection(d.angle)}
                      >
                        <Text style={styles.dirIconText}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* 3. Mover / Posicionar */}
              <View style={{ marginTop: 10 }}>
                <Text style={styles.panelSubLabel}>Posicionamento Fino:</Text>
                <View style={styles.nudgeRow}>
                  <TouchableOpacity style={styles.nudgeBtn} onPress={() => nudgeSelected(-3, 0)}>
                    <Ionicons name="arrow-back" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.nudgeBtn} onPress={() => nudgeSelected(0, -3)}>
                    <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.nudgeBtn} onPress={() => nudgeSelected(0, 3)}>
                    <Ionicons name="arrow-down" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.nudgeBtn} onPress={() => nudgeSelected(3, 0)}>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          {/* Tools & Color Picker Section */}
          <View style={styles.toolsSection}>
            <Text style={styles.sectionHeading}>Escolher Próxima Ferramenta</Text>
            
            <View style={styles.toolSelectorRow}>
              <TouchableOpacity 
                style={[styles.toolChip, selectedTool === 'arrow' && styles.toolChipActive]}
                onPress={() => setSelectedTool('arrow')}
              >
                <Ionicons name="arrow-redo-outline" size={18} color={selectedTool === 'arrow' ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.toolChipText, selectedTool === 'arrow' && styles.toolChipTextActive]}>Seta</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.toolChip, selectedTool === 'rect' && styles.toolChipActive]}
                onPress={() => setSelectedTool('rect')}
              >
                <Ionicons name="square-outline" size={18} color={selectedTool === 'rect' ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.toolChipText, selectedTool === 'rect' && styles.toolChipTextActive]}>Retângulo</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.toolChip, selectedTool === 'circle' && styles.toolChipActive]}
                onPress={() => setSelectedTool('circle')}
              >
                <Ionicons name="ellipse-outline" size={18} color={selectedTool === 'circle' ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.toolChipText, selectedTool === 'circle' && styles.toolChipTextActive]}>Círculo</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.toolChip, selectedTool === 'text' && styles.toolChipActive]}
                onPress={() => setSelectedTool('text')}
              >
                <Ionicons name="text-outline" size={18} color={selectedTool === 'text' ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.toolChipText, selectedTool === 'text' && styles.toolChipTextActive]}>Texto</Text>
              </TouchableOpacity>
            </View>

            {/* Color Palette */}
            <Text style={[styles.sectionHeading, { marginTop: 14 }]}>Cor da Marcação</Text>
            <View style={styles.colorPaletteRow}>
              {COLOR_PALETTE.map(c => (
                <TouchableOpacity 
                  key={c}
                  style={[
                    styles.colorDot, 
                    { backgroundColor: c },
                    selectedColor === c && styles.colorDotActive,
                    c === '#FFFFFF' && { borderWidth: 1, borderColor: '#94A3B8' }
                  ]}
                  onPress={() => {
                    setSelectedColor(c);
                    // Also update selected item color if any
                    if (selectedId) {
                      setAnnotations(prev => prev.map(item => item.id === selectedId ? { ...item, color: c } : item));
                    }
                  }}
                >
                  {selectedColor === c && (
                    <Ionicons name="checkmark" size={16} color={c === '#FFFFFF' ? '#000000' : '#FFFFFF'} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Text Input Modal for adding notes */}
        <Modal visible={showTextInputModal} transparent animationType="fade">
          <View style={styles.textModalOverlay}>
            <View style={styles.textModalContent}>
              <Text style={styles.textModalTitle}>Texto da Marcação Técnica</Text>

              <TextInput
                style={styles.textModalInput}
                value={textInputVal}
                onChangeText={setTextInputVal}
                placeholder="Ex: Fissura, Infiltração..."
                autoFocus
              />

              <Text style={styles.quickTagsTitle}>Sugestões Rápidas de Campo:</Text>
              <View style={styles.tagsContainer}>
                {QUICK_TEXT_TAGS.map(tag => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.tagBtn}
                    onPress={() => setTextInputVal(tag)}
                  >
                    <Text style={styles.tagBtnText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.textModalActions}>
                <TouchableOpacity 
                  style={[styles.textModalBtn, styles.cancelModalBtn]}
                  onPress={() => {
                    setShowTextInputModal(false);
                    setPendingTextPos(null);
                  }}
                >
                  <Text style={styles.cancelModalText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.textModalBtn, styles.confirmModalBtn]}
                  onPress={handleConfirmText}
                >
                  <Text style={styles.confirmModalText}>Inserir na Foto</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

export const PhotoAnnotationOverlay: React.FC<{ annotationsJson?: string }> = ({ annotationsJson }) => {
  if (!annotationsJson) return null;

  let items: AnnotationItem[] = [];
  try {
    const parsed = typeof annotationsJson === 'string' ? JSON.parse(annotationsJson) : annotationsJson;
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    return null;
  }

  if (items.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map(item => {
        const size = item.size || 40;
        const rotation = item.rotation || 0;

        return (
          <View 
            key={item.id} 
            style={[
              styles.annotationWrapper, 
              { 
                left: `${item.x}%`, 
                top: `${item.y}%`,
                transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
              }
            ]}
          >
            {item.type === 'arrow' && (
              <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${rotation}deg` }] }}>
                <Ionicons name="arrow-forward" size={size * 0.9} color={item.color} />
              </View>
            )}

            {item.type === 'rect' && (
              <View 
                style={[
                  styles.rectShape, 
                  { 
                    borderColor: item.color, 
                    width: size * 1.3, 
                    height: size * 0.8,
                    borderWidth: Math.max(2, size * 0.05),
                    transform: [{ rotate: `${rotation}deg` }]
                  }
                ]} 
              />
            )}

            {item.type === 'circle' && (
              <View 
                style={[
                  styles.circleShape, 
                  { 
                    borderColor: item.color, 
                    width: size, 
                    height: size,
                    borderRadius: size / 2,
                    borderWidth: Math.max(2, size * 0.05),
                  }
                ]} 
              />
            )}

            {item.type === 'text' && (
              <View style={[styles.textBadge, { backgroundColor: item.color, paddingHorizontal: 6, paddingVertical: 2 }]}>
                <Text style={[styles.badgeText, { fontSize: 10, color: item.color === '#FFFFFF' ? '#000000' : '#FFFFFF' }]}>
                  {item.text}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  saveBtn: {
    backgroundColor: '#10B981',
  },
  headerBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tipText: {
    color: '#E2E8F0',
    fontSize: 12,
    flex: 1,
  },
  mainScroll: {
    paddingBottom: 40,
  },
  canvasContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  canvasBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#475569',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  imageErrorOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    textAlign: 'center',
  },
  annotationWrapper: {
    position: 'absolute',
    zIndex: 10,
  },
  annotationSelectedWrapper: {
    zIndex: 20,
  },
  selectionBorder: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    borderStyle: 'dashed',
    margin: -6,
    borderRadius: 4,
  },
  handleDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    backgroundColor: '#38BDF8',
    borderRadius: 4,
  },
  dotTL: { top: -4, left: -4 },
  dotTR: { top: -4, right: -4 },
  dotBL: { bottom: -4, left: -4 },
  dotBR: { bottom: -4, right: -4 },
  rectShape: {
    borderWidth: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
  },
  circleShape: {
    borderWidth: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
  },
  textBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  canvasActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: CANVAS_SIZE,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  canvasActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#1E293B',
    borderRadius: 6,
  },
  canvasActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  countBadgeText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  selectedPanel: {
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  selectedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 8,
  },
  selectedTypeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  deleteSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deleteSelectedText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: 'bold',
  },
  panelSubLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  dimensionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sizeBtn: {
    backgroundColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  sizeBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  sizePresetsBox: {
    flexDirection: 'row',
    gap: 6,
  },
  presetChip: {
    backgroundColor: '#0F172A',
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  presetChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  presetChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  dirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  dirBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  dirIconBtn: {
    backgroundColor: '#0F172A',
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dirIconBtnActive: {
    backgroundColor: '#334155',
    borderColor: '#38BDF8',
  },
  dirIconText: {
    fontSize: 13,
  },
  nudgeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nudgeBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toolsSection: {
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
  },
  sectionHeading: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  toolSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toolChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  toolChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  toolChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotActive: {
    borderWidth: 2.5,
    borderColor: '#38BDF8',
  },
  textModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  textModalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  textModalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  textModalInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 12,
  },
  quickTagsTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  tagBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tagBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
  },
  textModalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  textModalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  cancelModalBtn: {
    backgroundColor: '#334155',
  },
  confirmModalBtn: {
    backgroundColor: '#0284C7',
  },
  cancelModalText: {
    color: '#E2E8F0',
    fontSize: 13,
  },
  confirmModalText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
