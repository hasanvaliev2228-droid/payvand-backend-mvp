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

export interface Database {
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      direct_conversation_pairs: {
        Row: {
          conversation_id: string;
          user_a: string;
          user_b: string;
        };
        Insert: Database['public']['Tables']['direct_conversation_pairs']['Row'];
        Update: Partial<Database['public']['Tables']['direct_conversation_pairs']['Row']>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string | null;
          message_type: string;
          file_path: string | null;
          file_url: string | null;
          file_name: string | null;
          file_size: number | null;
          mime_type: string | null;
          voice_duration_seconds: number | null;
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string | null;
          category: string | null;
          is_private: boolean;
          reminder_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['notes']['Row']> & {
          user_id: string;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['notes']['Row']>;
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          phone: string | null;
          position: string | null;
          salary: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['employees']['Row']> & {
          owner_id: string;
          name: string;
        };
        Update: Partial<Database['public']['Tables']['employees']['Row']>;
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          employee_id: string;
          check_in: string;
          check_out: string | null;
          work_minutes: number | null;
          date: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['attendance']['Row']> & {
          employee_id: string;
          check_in: string;
        };
        Update: Partial<Database['public']['Tables']['attendance']['Row']>;
        Relationships: [];
      };
      document_scans: {
        Row: {
          id: string;
          user_id: string;
          document_id: string | null;
          file_path: string;
          scan_type: string;
          status: string;
          provider: string;
          extracted_merchant_name: string | null;
          extracted_amount: number | null;
          extracted_currency: string | null;
          extracted_date: string | null;
          extracted_category: string | null;
          raw_text: string | null;
          confidence: number | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['document_scans']['Row']> & {
          user_id: string;
          file_path: string;
          scan_type: string;
        };
        Update: Partial<Database['public']['Tables']['document_scans']['Row']>;
        Relationships: [];
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
