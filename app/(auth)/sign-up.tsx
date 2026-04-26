import "@/global.css";
import React, { useMemo, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { Link, type Href, useRouter } from "expo-router";
import { styled } from "nativewind";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { useSignUp } from "@clerk/expo";

const SafeAreaView = styled(RNSafeAreaView);

type SignUpField = "email" | "password" | "code" | "global";
type SignUpErrors = Partial<Record<SignUpField, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPrimaryErrorMessage(error: unknown): string | undefined {
    if (!error || typeof error !== "object") {
        return undefined;
    }

    const maybeError = error as { message?: string; longMessage?: string };
    return maybeError.longMessage ?? maybeError.message;
}

function mapClerkErrors(error: unknown): SignUpErrors {
    const fallback = "Please check your details and try again.";

    if (!Array.isArray(error) || error.length === 0) {
        return { global: getPrimaryErrorMessage(error) ?? fallback };
    }

    const next: SignUpErrors = {};
    for (const issue of error) {
        if (!issue || typeof issue !== "object") {
            continue;
        }

        const entry = issue as { code?: string; longMessage?: string; message?: string };
        const message = entry.longMessage ?? entry.message ?? fallback;

        if (entry.code?.includes("email") || entry.code?.includes("identifier")) {
            next.email = message;
            continue;
        }

        if (entry.code?.includes("password")) {
            next.password = message;
            continue;
        }

        if (entry.code?.includes("code")) {
            next.code = message;
            continue;
        }

        next.global = message;
    }

    return next;
}

function validateInput(email: string, password: string): SignUpErrors {
    const errors: SignUpErrors = {};
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
        errors.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(normalizedEmail)) {
        errors.email = "Enter a valid email address.";
    }

    if (!password) {
        errors.password = "Password is required.";
    } else if (password.length < 8) {
        errors.password = "Password must be at least 8 characters.";
    } else if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        errors.password = "Use at least one uppercase letter and one number.";
    }

    return errors;
}

export default function SignUpScreen() {
    const { signUp } = useSignUp();
    const router = useRouter();

    const [emailAddress, setEmailAddress] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [errors, setErrors] = useState<SignUpErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isVerificationStep =
        signUp.status === "missing_requirements" &&
        signUp.unverifiedFields.includes("email_address") &&
        signUp.missingFields.length === 0;

    const isSubmitDisabled = useMemo(() => {
        if (isSubmitting) {
            return true;
        }

        if (isVerificationStep) {
            return !code.trim();
        }

        return !emailAddress.trim() || !password;
    }, [code, emailAddress, isSubmitting, isVerificationStep, password]);

    const finalizeAndNavigate = async () => {
        await signUp.finalize({
            navigate: ({ session, decorateUrl }) => {
                if (session?.currentTask) {
                    setErrors({
                        global: "Additional verification is required before continuing.",
                    });
                    return;
                }

                const url = decorateUrl("/(tabs)");
                const target = url.startsWith("http") ? ("/(tabs)" as Href) : (url as Href);
                router.replace(target);
            },
        });
    };

    const handleCreateAccount = async () => {
        const formErrors = validateInput(emailAddress, password);
        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            return;
        }

        setIsSubmitting(true);
        setErrors({});

        try {
            const { error } = await signUp.password({
                emailAddress: emailAddress.trim().toLowerCase(),
                password,
            });

            if (error) {
                setErrors(mapClerkErrors(error));
                return;
            }

            await signUp.verifications.sendEmailCode();
        } catch (err) {
            setErrors({
                global: getPrimaryErrorMessage(err) ?? "Unable to create your account. Please try again.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerifyCode = async () => {
        if (!code.trim()) {
            setErrors({ code: "Verification code is required." });
            return;
        }

        setIsSubmitting(true);
        setErrors({});

        try {
            const { error } = await signUp.verifications.verifyEmailCode({
                code: code.trim(),
            });

            if (error) {
                setErrors(mapClerkErrors(error));
                return;
            }

            if (signUp.status === "complete") {
                await finalizeAndNavigate();
                return;
            }

            setErrors({
                global: "Verification is not complete yet. Please check the code and try again.",
            });
        } catch (err) {
            setErrors({
                global: getPrimaryErrorMessage(err) ?? "Verification failed. Please try again.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitHandler = isVerificationStep ? handleVerifyCode : handleCreateAccount;

    return (
        <SafeAreaView className="auth-safe-area">
            <KeyboardAvoidingView
                className="auth-screen"
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    className="auth-scroll"
                    contentContainerClassName="auth-content"
                    keyboardShouldPersistTaps="handled"
                >
                    <View className="auth-brand-block">
                        <View className="auth-logo-wrap">
                            <View className="auth-logo-mark">
                                <Text className="auth-logo-mark-text">R</Text>
                            </View>
                            <View>
                                <Text className="auth-wordmark">Recurly</Text>
                                <Text className="auth-wordmark-sub">Smart Billing</Text>
                            </View>
                        </View>
                        <Text className="auth-title">{isVerificationStep ? "Verify your email" : "Create account"}</Text>
                        <Text className="auth-subtitle">
                            {isVerificationStep
                                ? "Enter the code we emailed you to finish securing your account."
                                : "Start tracking subscriptions with one secure Recurly account."}
                        </Text>
                    </View>

                    <View className="auth-card">
                        {errors.global ? <Text className="auth-error">{errors.global}</Text> : null}

                        <View className="auth-form">
                            {!isVerificationStep ? (
                                <>
                                    <View className="auth-field">
                                        <Text className="auth-label">Email</Text>
                                        <TextInput
                                            className={`auth-input ${errors.email ? "auth-input-error" : ""}`}
                                            placeholder="Enter your email"
                                            placeholderTextColor="rgba(0, 0, 0, 0.45)"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            keyboardType="email-address"
                                            textContentType="emailAddress"
                                            autoComplete="email"
                                            value={emailAddress}
                                            onChangeText={(value) => {
                                                setEmailAddress(value);
                                                if (errors.email) {
                                                    setErrors((current) => ({ ...current, email: undefined }));
                                                }
                                            }}
                                        />
                                        {errors.email ? <Text className="auth-error">{errors.email}</Text> : null}
                                    </View>

                                    <View className="auth-field">
                                        <Text className="auth-label">Password</Text>
                                        <TextInput
                                            className={`auth-input ${errors.password ? "auth-input-error" : ""}`}
                                            placeholder="Enter your password"
                                            placeholderTextColor="rgba(0, 0, 0, 0.45)"
                                            secureTextEntry
                                            autoCapitalize="none"
                                            textContentType="newPassword"
                                            autoComplete="new-password"
                                            value={password}
                                            onChangeText={(value) => {
                                                setPassword(value);
                                                if (errors.password) {
                                                    setErrors((current) => ({ ...current, password: undefined }));
                                                }
                                            }}
                                        />
                                        {errors.password ? (
                                            <Text className="auth-error">{errors.password}</Text>
                                        ) : (
                                            <Text className="auth-helper">At least 8 characters, 1 uppercase letter, and 1 number.</Text>
                                        )}
                                    </View>
                                </>
                            ) : (
                                <View className="auth-field">
                                    <Text className="auth-label">Verification code</Text>
                                    <TextInput
                                        className={`auth-input ${errors.code ? "auth-input-error" : ""}`}
                                        placeholder="Enter your code"
                                        placeholderTextColor="rgba(0, 0, 0, 0.45)"
                                        keyboardType="number-pad"
                                        textContentType="oneTimeCode"
                                        autoComplete="one-time-code"
                                        value={code}
                                        onChangeText={(value) => {
                                            setCode(value);
                                            if (errors.code) {
                                                setErrors((current) => ({ ...current, code: undefined }));
                                            }
                                        }}
                                    />
                                    {errors.code ? <Text className="auth-error">{errors.code}</Text> : null}

                                    <Pressable
                                        className="auth-secondary-button"
                                        onPress={() => signUp.verifications.sendEmailCode()}
                                        disabled={isSubmitting}
                                    >
                                        <Text className="auth-secondary-button-text">Send a new code</Text>
                                    </Pressable>
                                </View>
                            )}

                            <Pressable
                                className={`auth-button ${isSubmitDisabled ? "auth-button-disabled" : ""}`}
                                onPress={submitHandler}
                                disabled={isSubmitDisabled}
                            >
                                <Text className="auth-button-text">
                                    {isSubmitting ? "Please wait..." : isVerificationStep ? "Verify email" : "Create account"}
                                </Text>
                            </Pressable>
                        </View>

                        {!isVerificationStep ? (
                            <View className="auth-link-row">
                                <Text className="auth-link-copy">Already have an account?</Text>
                                <Link href="/(auth)/sign-in" asChild>
                                    <Pressable>
                                        <Text className="auth-link">Sign in</Text>
                                    </Pressable>
                                </Link>
                            </View>
                        ) : (
                            <View className="auth-link-row">
                                <Text className="auth-link-copy">Used the wrong email?</Text>
                                <Pressable onPress={() => signUp.reset()}>
                                    <Text className="auth-link">Start over</Text>
                                </Pressable>
                            </View>
                        )}

                        <View nativeID="clerk-captcha" />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
