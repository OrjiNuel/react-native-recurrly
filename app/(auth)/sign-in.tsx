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
import { useSignIn } from "@clerk/expo";

const SafeAreaView = styled(RNSafeAreaView);

type SignInField = "email" | "password" | "code" | "global";
type SignInErrors = Partial<Record<SignInField, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPrimaryErrorMessage(error: unknown): string | undefined {
    if (!error || typeof error !== "object") {
        return undefined;
    }

    const maybeError = error as { message?: string; longMessage?: string };
    return maybeError.longMessage ?? maybeError.message;
}

function mapClerkErrors(error: unknown): SignInErrors {
    const fallback = "Please check your details and try again.";

    if (!Array.isArray(error) || error.length === 0) {
        return { global: getPrimaryErrorMessage(error) ?? fallback };
    }

    const next: SignInErrors = {};
    for (const issue of error) {
        if (!issue || typeof issue !== "object") {
            continue;
        }

        const entry = issue as { code?: string; longMessage?: string; message?: string };
        const message = entry.longMessage ?? entry.message ?? fallback;

        if (entry.code?.includes("identifier")) {
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

function validateInput(email: string, password: string): SignInErrors {
    const errors: SignInErrors = {};
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
    }

    return errors;
}

export default function SignInScreen() {
    const { signIn } = useSignIn();
    const router = useRouter();

    const [emailAddress, setEmailAddress] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [errors, setErrors] = useState<SignInErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isMfaStep = signIn.status === "needs_client_trust";

    const isSubmitDisabled = useMemo(() => {
        if (isSubmitting) {
            return true;
        }

        if (isMfaStep) {
            return !code.trim();
        }

        return !emailAddress.trim() || !password;
    }, [code, emailAddress, isMfaStep, isSubmitting, password]);

    const finalizeAndNavigate = async () => {
        await signIn.finalize({
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

    const handlePasswordSignIn = async () => {
        const formErrors = validateInput(emailAddress, password);
        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            return;
        }

        setIsSubmitting(true);
        setErrors({});

        try {
            const { error } = await signIn.password({
                emailAddress: emailAddress.trim().toLowerCase(),
                password,
            });

            if (error) {
                setErrors(mapClerkErrors(error));
                return;
            }

            if (signIn.status === "complete") {
                await finalizeAndNavigate();
                return;
            }

            if (signIn.status === "needs_client_trust") {
                const emailCodeFactor = signIn.supportedSecondFactors.find(
                    (factor) => factor.strategy === "email_code",
                );

                if (emailCodeFactor) {
                    await signIn.mfa.sendEmailCode();
                } else {
                    setErrors({
                        global: "Second-factor authentication is required. Email code is not available.",
                    });
                }
                return;
            }

            if (signIn.status === "needs_second_factor") {
                setErrors({
                    global: "Second-factor authentication is required for this account.",
                });
                return;
            }

            setErrors({
                global: "Sign in is not complete yet. Please try again.",
            });
        } catch (err) {
            setErrors({
                global: getPrimaryErrorMessage(err) ?? "Unable to sign in. Please try again.",
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
            const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });

            if (error) {
                setErrors(mapClerkErrors(error));
                return;
            }

            if (signIn.status === "complete") {
                await finalizeAndNavigate();
                return;
            }

            setErrors({
                global: "Verification is not complete yet. Please try again.",
            });
        } catch (err) {
            setErrors({
                global: getPrimaryErrorMessage(err) ?? "Verification failed. Please try again.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitHandler = isMfaStep ? handleVerifyCode : handlePasswordSignIn;

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
                        <Text className="auth-title">{isMfaStep ? "Check your email" : "Welcome back"}</Text>
                        <Text className="auth-subtitle">
                            {isMfaStep
                                ? "Enter the verification code sent to your inbox to continue."
                                : "Sign in to continue managing your subscriptions."}
                        </Text>
                    </View>

                    <View className="auth-card">
                        {errors.global ? <Text className="auth-error">{errors.global}</Text> : null}

                        <View className="auth-form">
                            {!isMfaStep ? (
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
                                            textContentType="password"
                                            autoComplete="current-password"
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
                                        ) : null}
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
                                        onPress={() => signIn.mfa.sendEmailCode()}
                                        disabled={isSubmitting}
                                    >
                                        <Text className="auth-secondary-button-text">Send a new code</Text>
                                    </Pressable>

                                    <Pressable
                                        className="auth-secondary-button"
                                        onPress={() => signIn.reset()}
                                        disabled={isSubmitting}
                                    >
                                        <Text className="auth-secondary-button-text">Start over</Text>
                                    </Pressable>
                                </View>
                            )}

                            <Pressable
                                className={`auth-button ${isSubmitDisabled ? "auth-button-disabled" : ""}`}
                                onPress={submitHandler}
                                disabled={isSubmitDisabled}
                            >
                                <Text className="auth-button-text">
                                    {isSubmitting ? "Please wait..." : isMfaStep ? "Verify code" : "Sign in"}
                                </Text>
                            </Pressable>
                        </View>

                        {!isMfaStep ? (
                            <View className="auth-link-row">
                                <Text className="auth-link-copy">New to Recurly?</Text>
                                <Link href="/(auth)/sign-up" asChild>
                                    <Pressable>
                                        <Text className="auth-link">Create an account</Text>
                                    </Pressable>
                                </Link>
                            </View>
                        ) : null}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
