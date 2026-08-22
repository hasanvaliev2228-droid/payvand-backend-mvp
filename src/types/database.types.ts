/**
 * Hand-authored baseline matching the SQL migrations. In real development
 * this file is REGENERATED from the live database via:
 *   npm run db:types   (supabase gen types typescript --local)
 * which keeps it perfectly in sync with supabase/migrations/*.sql. Commit
 * the generated version; this file is a correct, compilable starting point
 * so the project builds before the first `supabase start`.
 */

export type AppLanguage = 'tg' | 'ru' | 'en' | 'zh';
export type AppRole = 'user' | 'admin';

interface RawDatabase {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          avatar_path: string | null;
          language: AppLanguage;
          city: string | null;
          date_of_birth: string | null;
          bio: string | null;
          role: AppRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      user_settings: {
        Row: {
          user_id: string;
          theme: string;
          currency: string;
          biometric_enabled: boolean;
          pin_hash: string | null;
          notification_enabled: boolean;
          push_enabled: boolean;
          offline_sync_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['user_settings']['Row']> & {
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['user_settings']['Row']>;
      };
      bank_cards: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          bank_name: string;
          cardholder_name: string | null;
          last4: string;
          card_network: string | null;
          color: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['bank_cards']['Row']> & {
          user_id: string;
          title: string;
          bank_name: string;
          last4: string;
        };
        Update: Partial<Database['public']['Tables']['bank_cards']['Row']>;
      };
      qr_codes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          qr_type: string;
          payload: string;
          image_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['qr_codes']['Row']> & {
          user_id: string;
          title: string;
          qr_type: string;
          payload: string;
        };
        Update: Partial<Database['public']['Tables']['qr_codes']['Row']>;
      };
      categories: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          type: string;
          icon: string | null;
          color: string | null;
          is_system: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['categories']['Row']> & {
          name: string;
          type: string;
        };
        Update: Partial<Database['public']['Tables']['categories']['Row']>;
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          type: string;
          amount: number;
          currency: string;
          title: string;
          note: string | null;
          transaction_date: string;
          attachment_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['transactions']['Row']> & {
          user_id: string;
          type: string;
          amount: number;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['transactions']['Row']>;
      };
      loans: {
        Row: {
          id: string;
          owner_id: string;
          borrower_name: string;
          borrower_phone: string | null;
          loan_type: string;
          principal_amount: number;
          interest_rate: number;
          total_payable: number;
          start_date: string;
          due_date: string;
          payment_frequency: string;
          status: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['loans']['Row']> & {
          owner_id: string;
          borrower_name: string;
          loan_type: string;
          principal_amount: number;
          total_payable: number;
          start_date: string;
          due_date: string;
          payment_frequency: string;
        };
        Update: Partial<Database['public']['Tables']['loans']['Row']>;
      };
      loan_payments: {
        Row: {
          id: string;
          loan_id: string;
          amount: number;
          payment_date: string;
          note: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['loan_payments']['Row']> & {
          loan_id: string;
          amount: number;
        };
        Update: Partial<Database['public']['Tables']['loan_payments']['Row']>;
      };
      contacts: {
        Row: {
          id: string;
          owner_id: string;
          contact_user_id: string | null;
          display_name: string;
          phone: string | null;
          avatar_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['contacts']['Row']> & {
          owner_id: string;
          display_name: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Row']>;
      };
      conversations: {
        Row: {
          id: string;
          type: string;
          title: string | null;
          created_by: string;
          image_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['conversations']['Row']> & {
          type: string;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['conversations']['Row']>;
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          user_id: string;
          member_role: string;
          joined_at: string;
          last_read_at: string | null;
          muted_until: string | null;
        };
        Insert: Partial<Database['public']['Tables']['conversation_members']['Row']> & {
          conversation_id: string;
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['conversation_members']['Row']>;
      };
      direct_conversation_pairs: {
        Row: {
          conversation_id: string;
          user_a: string;
          user_b: string;
        };
        Insert: Database['public']['Tables']['direct_conversation_pairs']['Row'];
        Update: Partial<Database['public']['Tables']['direct_conversation_pairs']['Row']>;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string | null;
          message_type: string;
          file_path: string | null;
          reply_to_id: string | null;
          forwarded_from_id: string | null;
          edited_at: string | null;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['messages']['Row']> & {
          conversation_id: string;
          sender_id: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Row']>;
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['message_reactions']['Row']> & {
          message_id: string;
          user_id: string;
          emoji: string;
        };
        Update: Partial<Database['public']['Tables']['message_reactions']['Row']>;
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          original_filename: string;
          stored_filename: string;
          file_path: string;
          mime_type: string;
          file_size: number;
          folder: string | null;
          document_type: string | null;
          signature_status: string;
          is_private: boolean;
          scan_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['documents']['Row']> & {
          user_id: string;
          title: string;
          original_filename: string;
          stored_filename: string;
          file_path: string;
          mime_type: string;
          file_size: number;
        };
        Update: Partial<Database['public']['Tables']['documents']['Row']>;
      };
      calendar_events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          event_type: string;
          start_at: string;
          end_at: string | null;
          reminder_minutes: number | null;
          is_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['calendar_events']['Row']> & {
          user_id: string;
          title: string;
          event_type: string;
          start_at: string;
        };
        Update: Partial<Database['public']['Tables']['calendar_events']['Row']>;
      };
      health_records: {
        Row: {
          id: string;
          user_id: string;
          record_type: string;
          value: number | null;
          unit: string | null;
          systolic: number | null;
          diastolic: number | null;
          recorded_at: string;
          note: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['health_records']['Row']> & {
          user_id: string;
          record_type: string;
        };
        Update: Partial<Database['public']['Tables']['health_records']['Row']>;
      };
      service_providers: {
        Row: {
          id: string;
          owner_id: string | null;
          name: string;
          category: string;
          phone: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          description: string | null;
          rating: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['service_providers']['Row']> & {
          name: string;
          category: string;
        };
        Update: Partial<Database['public']['Tables']['service_providers']['Row']>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string | null;
          notification_type: string;
          data: Record<string, unknown>;
          read_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & {
          user_id: string;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
      };
      device_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['device_tokens']['Row']> & {
          user_id: string;
          token: string;
          platform: string;
        };
        Update: Partial<Database['public']['Tables']['device_tokens']['Row']>;
      };
      offline_sync_events: {
        Row: {
          id: string;
          user_id: string;
          client_event_id: string;
          entity_type: string;
          entity_id: string | null;
          operation: string;
          payload: Record<string, unknown>;
          client_created_at: string;
          server_processed_at: string | null;
          status: string;
          error_message: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['offline_sync_events']['Row']> & {
          user_id: string;
          client_event_id: string;
          entity_type: string;
          operation: string;
          payload: Record<string, unknown>;
          client_created_at: string;
        };
        Update: Partial<Database['public']['Tables']['offline_sync_events']['Row']>;
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Record<string, unknown>;
          ip_hash: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['audit_logs']['Row']> & {
          action: string;
          entity_type: string;
        };
        Update: Partial<Database['public']['Tables']['audit_logs']['Row']>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_conversation_member: { Args: { p_conversation_id: string }; Returns: boolean };
    };
    Enums: {
      app_language: AppLanguage;
      app_role: AppRole;
    };
  };
}

/**
 * Supabase v2 requires every table definition to expose a Relationships tuple.
 * The handwritten baseline deliberately does not model joins yet, so each
 * table has an empty tuple. Keep the raw shape above focused on columns and
 * use this normalized exported type everywhere a Supabase client is created.
 */
export type Database = {
  public: Omit<RawDatabase['public'], 'Tables'> & {
    Tables: {
      [
        TableName in keyof RawDatabase['public']['Tables']
      ]: RawDatabase['public']['Tables'][TableName] & { Relationships: [] };
    };
  };
};
