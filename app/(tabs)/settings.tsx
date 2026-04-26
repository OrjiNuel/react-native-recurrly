import "@/global.css";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { useClerk, useUser } from "@clerk/expo";

const SafeAreaView = styled(RNSafeAreaView);

const Settings = () => {
    const { signOut } = useClerk();
    const { user } = useUser();
    const [isSigningOut, setIsSigningOut] = useState(false);

    const email = useMemo(() => user?.emailAddresses?.[0]?.emailAddress ?? "No email", [user]);

    const handleSignOut = async () => {
        if (isSigningOut) {
            return;
        }

        setIsSigningOut(true);
        try {
            await signOut();
        } finally {
            setIsSigningOut(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background p-5">
            <Text className="text-3xl font-sans-bold text-primary">Settings</Text>

            <View className="mt-6 rounded-2xl border border-border bg-card p-4">
                <Text className="text-xs font-sans-semibold uppercase tracking-[1px] text-muted-foreground">
                    Signed in as
                </Text>
                <Text className="mt-2 text-base font-sans-semibold text-primary">{email}</Text>
            </View>

            <Pressable
                className={`auth-button mt-6 ${isSigningOut ? "auth-button-disabled" : ""}`}
                onPress={handleSignOut}
                disabled={isSigningOut}
            >
                <Text className="auth-button-text">{isSigningOut ? "Signing out..." : "Sign out"}</Text>
            </Pressable>
        </SafeAreaView>
    );
};

export default Settings;
