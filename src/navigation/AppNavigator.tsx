import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../theme/colors';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { ProjectsListScreen } from '../screens/projects/ProjectsListScreen';
import { ProjectDetailScreen } from '../screens/projects/ProjectDetailScreen';
import { ProjectFormScreen } from '../screens/projects/ProjectFormScreen';
import { VisitsListScreen } from '../screens/visits/VisitsListScreen';
import { VisitDetailScreen } from '../screens/visits/VisitDetailScreen';
import { VisitFormScreen } from '../screens/visits/VisitFormScreen';
import { ReportsListScreen } from '../screens/reports/ReportsListScreen';
import { ReportDetailScreen } from '../screens/reports/ReportDetailScreen';
import { ReportFormScreen } from '../screens/reports/ReportFormScreen';
import { ExpressReportsScreen } from '../screens/express/ExpressReportsScreen';
import { ApprovalDashboardScreen } from '../screens/approvals/ApprovalDashboardScreen';
import { ExpensesScreen } from '../screens/expenses/ExpensesScreen';
import { RemindersScreen } from '../screens/reminders/RemindersScreen';
import { ContactsScreen } from '../screens/contacts/ContactsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="DashboardTab"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: Colors.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'cube-outline';

          if (route.name === 'DashboardTab') {
            iconName = focused ? 'speedometer' : 'speedometer-outline';
          } else if (route.name === 'ObrasTab') {
            iconName = focused ? 'business' : 'business-outline';
          } else if (route.name === 'PendentesTab') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'VisitasTab') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'ConfiguracoesTab') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="DashboardTab" 
        component={DashboardScreen} 
        options={{ tabBarLabel: 'Início' }} 
      />
      <Tab.Screen 
        name="ObrasTab" 
        component={ProjectsListScreen} 
        options={{ tabBarLabel: 'Obras' }} 
      />
      <Tab.Screen 
        name="PendentesTab" 
        component={ReportsListScreen} 
        options={{ tabBarLabel: 'Relatórios' }} 
      />
      <Tab.Screen 
        name="VisitasTab" 
        component={VisitsListScreen} 
        options={{ tabBarLabel: 'Agenda' }} 
      />
      <Tab.Screen 
        name="ConfiguracoesTab" 
        component={SettingsScreen} 
        options={{ tabBarLabel: 'Ajustes' }} 
      />
    </Tab.Navigator>
  );
}

export const AppNavigator: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={TabNavigator} />
            <Stack.Screen name="ProjectDetailScreen" component={ProjectDetailScreen} />
            <Stack.Screen name="ProjectFormScreen" component={ProjectFormScreen} />
            <Stack.Screen name="VisitDetailScreen" component={VisitDetailScreen} />
            <Stack.Screen name="VisitFormScreen" component={VisitFormScreen} />
            <Stack.Screen name="ReportDetailScreen" component={ReportDetailScreen} />
            <Stack.Screen name="ReportFormScreen" component={ReportFormScreen} />
            <Stack.Screen name="ExpressReportsScreen" component={ExpressReportsScreen} />
            <Stack.Screen name="ApprovalDashboardScreen" component={ApprovalDashboardScreen} />
            <Stack.Screen name="ExpensesScreen" component={ExpensesScreen} />
            <Stack.Screen name="LembretesScreen" component={RemindersScreen} />
            <Stack.Screen name="ContactsScreen" component={ContactsScreen} />
            <Stack.Screen name="SettingsScreen" component={SettingsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
