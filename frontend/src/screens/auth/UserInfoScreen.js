import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
} from "react-native";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/Button";
import Input from "../../components/Input";

export default function UserInfoScreen({ navigation }) {
  const { submitUserInfo, user } = useAuth();
  const [unitSystem, setUnitSystem] = useState(user?.unit_system || "metric");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    // Initialize with current date or existing dateOfBirth if available
    if (user?.date_of_birth) {
      return new Date(user.date_of_birth);
    }
    // Default to 25 years ago for better UX
    const defaultDate = new Date();
    defaultDate.setFullYear(defaultDate.getFullYear() - 25);
    return defaultDate;
  });
  const [showHeightPicker, setShowHeightPicker] = useState(false);
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [selectedHeight, setSelectedHeight] = useState({
    metric: 170, // Default 170 cm
    feet: 5,
    inches: 7,
  });
  const [selectedWeight, setSelectedWeight] = useState({
    metric: 70, // Default 70 kg
    imperial: 154, // Default 154 lbs
  });

  const handleSkip = () => {
    // Navigate to Home screen, skipping user info
    navigation.navigate("Home");
  };

  const validateAndSubmit = async () => {
    const newErrors = {};

    // Validate date of birth (only if provided)
    if (dateOfBirth.trim()) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        newErrors.dateOfBirth =
          "Please use format YYYY-MM-DD (e.g., 1990-11-11)";
      } else {
        const date = new Date(dateOfBirth);
        if (isNaN(date.getTime())) {
          newErrors.dateOfBirth = "Invalid date";
        } else if (date > new Date()) {
          newErrors.dateOfBirth = "Date cannot be in the future";
        }
      }
    }

    // Validate height (only if provided)
    if (height.trim()) {
      const heightNum = parseFloat(height);
      if (isNaN(heightNum) || heightNum <= 0) {
        newErrors.height = "Please enter a valid height";
      } else if (unitSystem === "metric" && heightNum > 300) {
        newErrors.height = "Height cannot exceed 300 cm";
      } else if (unitSystem === "imperial" && heightNum > 120) {
        newErrors.height = "Height cannot exceed 120 inches";
      }
    }

    // Validate weight (only if provided)
    if (weight.trim()) {
      const weightNum = parseFloat(weight);
      if (isNaN(weightNum) || weightNum <= 0) {
        newErrors.weight = "Please enter a valid weight";
      } else if (unitSystem === "metric" && weightNum > 500) {
        newErrors.weight = "Weight cannot exceed 500 kg";
      } else if (unitSystem === "imperial" && weightNum > 1100) {
        newErrors.weight = "Weight cannot exceed 1100 lbs";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // If no fields are filled, just skip
    if (!dateOfBirth.trim() && !height.trim() && !weight.trim()) {
      handleSkip();
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const userInfoData = {
        unit_system: unitSystem,
      };

      // Only include fields that have values
      if (dateOfBirth.trim()) {
        userInfoData.date_of_birth = dateOfBirth.trim();
      }
      if (height.trim()) {
        userInfoData.height = parseFloat(height);
      }
      if (weight.trim()) {
        userInfoData.weight = parseFloat(weight);
      }

      const result = await submitUserInfo(userInfoData);

      if (result.success) {
        // Navigate to Home after successful submission
        navigation.navigate("Home");
      } else {
        setErrors({ submit: result.error || "Failed to save information" });
      }
    } catch (err) {
      setErrors({ submit: "An error occurred. Please try again." });
      console.error("User info submission error:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleDateSelect = () => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    const formattedDate = `${year}-${month}-${day}`;
    setDateOfBirth(formattedDate);
    setShowDatePicker(false);
    if (errors.dateOfBirth) {
      setErrors({ ...errors, dateOfBirth: "" });
    }
  };

  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const generateYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= currentYear - 120; i--) {
      years.push(i);
    }
    return years;
  };

  const generateMonths = () => {
    return [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
  };

  const generateDays = (year, month) => {
    const daysInMonth = getDaysInMonth(year, month);
    const days = [];
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const generateHeightValues = () => {
    if (unitSystem === "metric") {
      // Generate cm values from 120 to 250
      const values = [];
      for (let i = 120; i <= 250; i++) {
        values.push(i);
      }
      return values;
    } else {
      // Generate feet (4-8) and inches (0-11)
      // 4 feet = 48 inches = ~122 cm, which is close to 120 cm
      return {
        feet: [4, 5, 6, 7, 8],
        inches: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      };
    }
  };

  const generateWeightValues = () => {
    if (unitSystem === "metric") {
      // Generate kg values from 30 to 300
      const values = [];
      for (let i = 30; i <= 300; i++) {
        values.push(i);
      }
      return values;
    } else {
      // Generate lbs values from 66 to 700
      // 30 kg ≈ 66 lbs
      const values = [];
      for (let i = 66; i <= 700; i++) {
        values.push(i);
      }
      return values;
    }
  };

  const formatHeightForDisplay = () => {
    if (!height) return "";
    if (unitSystem === "metric") {
      return `${height} cm`;
    } else {
      // Convert inches to feet and inches
      const totalInches = parseFloat(height);
      if (isNaN(totalInches)) return "";
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      return `${feet}'${inches}"`;
    }
  };

  const formatWeightForDisplay = () => {
    if (!weight) return "";
    return unitSystem === "metric" ? `${weight} kg` : `${weight} lbs`;
  };

  const handleHeightSelect = () => {
    if (unitSystem === "metric") {
      setHeight(selectedHeight.metric.toString());
    } else {
      // Convert feet and inches to total inches
      const totalInches = selectedHeight.feet * 12 + selectedHeight.inches;
      setHeight(totalInches.toString());
    }
    setShowHeightPicker(false);
    if (errors.height) {
      setErrors({ ...errors, height: "" });
    }
  };

  const handleWeightSelect = () => {
    const weightValue =
      unitSystem === "metric"
        ? selectedWeight.metric.toString()
        : selectedWeight.imperial.toString();
    setWeight(weightValue);
    setShowWeightPicker(false);
    if (errors.weight) {
      setErrors({ ...errors, weight: "" });
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Tell us about yourself</Text>
        <Text style={styles.subtitle}>
          This information helps us provide personalized health insights.
          {"\n"}All fields are optional.
        </Text>

        {/* Unit System Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Unit System</Text>
          <View style={styles.unitSelector}>
            <TouchableOpacity
              style={[
                styles.unitButton,
                unitSystem === "metric" && styles.unitButtonSelected,
              ]}
              onPress={() => {
                setUnitSystem("metric");
                // Clear height and weight when switching units
                setHeight("");
                setWeight("");
                setErrors({});
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.unitText,
                  unitSystem === "metric" && styles.unitTextSelected,
                ]}
              >
                Metric
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.unitButton,
                unitSystem === "imperial" && styles.unitButtonSelected,
              ]}
              onPress={() => {
                setUnitSystem("imperial");
                // Clear height and weight when switching units
                setHeight("");
                setWeight("");
                setErrors({});
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.unitText,
                  unitSystem === "imperial" && styles.unitTextSelected,
                ]}
              >
                Imperial
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date of Birth */}
        <View style={styles.dateContainer}>
          <Text style={styles.label}>Date of Birth</Text>
          <TouchableOpacity
            style={[
              styles.dateInput,
              errors.dateOfBirth && styles.dateInputError,
            ]}
            onPress={() => {
              // If dateOfBirth exists, parse it and set as selectedDate
              if (dateOfBirth) {
                const parsedDate = new Date(dateOfBirth);
                if (!isNaN(parsedDate.getTime())) {
                  setSelectedDate(parsedDate);
                }
              }
              setShowDatePicker(true);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dateInputText,
                !dateOfBirth && styles.dateInputPlaceholder,
              ]}
            >
              {dateOfBirth
                ? formatDateForDisplay(dateOfBirth)
                : "Select your date of birth"}
            </Text>
          </TouchableOpacity>
          {errors.dateOfBirth && (
            <Text style={styles.errorText}>{errors.dateOfBirth}</Text>
          )}
        </View>

        {/* Date Picker Modal */}
        <Modal
          visible={showDatePicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Date of Birth</Text>

              <View style={styles.datePickerContainer}>
                {/* Year Picker */}
                <View style={styles.pickerColumn}>
                  <Text style={styles.pickerLabel}>Year</Text>
                  <ScrollView style={styles.pickerScrollView}>
                    {generateYears().map((year) => (
                      <TouchableOpacity
                        key={year}
                        style={[
                          styles.pickerOption,
                          selectedDate.getFullYear() === year &&
                            styles.pickerOptionSelected,
                        ]}
                        onPress={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setFullYear(year);
                          // Adjust day if needed (e.g., Feb 29 -> Feb 28)
                          const daysInMonth = getDaysInMonth(
                            year,
                            newDate.getMonth()
                          );
                          if (newDate.getDate() > daysInMonth) {
                            newDate.setDate(daysInMonth);
                          }
                          setSelectedDate(newDate);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            selectedDate.getFullYear() === year &&
                              styles.pickerOptionTextSelected,
                          ]}
                        >
                          {year}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Month Picker */}
                <View style={styles.pickerColumn}>
                  <Text style={styles.pickerLabel}>Month</Text>
                  <ScrollView style={styles.pickerScrollView}>
                    {generateMonths().map((month, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.pickerOption,
                          selectedDate.getMonth() === index &&
                            styles.pickerOptionSelected,
                        ]}
                        onPress={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setMonth(index);
                          // Adjust day if needed
                          const daysInMonth = getDaysInMonth(
                            newDate.getFullYear(),
                            index
                          );
                          if (newDate.getDate() > daysInMonth) {
                            newDate.setDate(daysInMonth);
                          }
                          setSelectedDate(newDate);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            selectedDate.getMonth() === index &&
                              styles.pickerOptionTextSelected,
                          ]}
                        >
                          {month}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Day Picker */}
                <View style={styles.pickerColumn}>
                  <Text style={styles.pickerLabel}>Day</Text>
                  <ScrollView style={styles.pickerScrollView}>
                    {generateDays(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth()
                    ).map((day) => (
                      <TouchableOpacity
                        key={day}
                        style={[
                          styles.pickerOption,
                          selectedDate.getDate() === day &&
                            styles.pickerOptionSelected,
                        ]}
                        onPress={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setDate(day);
                          setSelectedDate(newDate);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            selectedDate.getDate() === day &&
                              styles.pickerOptionTextSelected,
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  onPress={() => setShowDatePicker(false)}
                  variant="outline"
                  style={styles.modalButton}
                />
                <Button
                  title="Select"
                  onPress={handleDateSelect}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Height */}
        <View style={styles.dateContainer}>
          <Text style={styles.label}>
            Height {unitSystem === "metric" ? "(cm)" : "(ft'in\")"}
          </Text>
          <TouchableOpacity
            style={[styles.dateInput, errors.height && styles.dateInputError]}
            onPress={() => {
              // Initialize selectedHeight from current height value
              if (height) {
                const heightNum = parseFloat(height);
                if (!isNaN(heightNum)) {
                  if (unitSystem === "metric") {
                    setSelectedHeight({
                      ...selectedHeight,
                      metric: Math.round(heightNum),
                    });
                  } else {
                    const feet = Math.floor(heightNum / 12);
                    const inches = Math.round(heightNum % 12);
                    setSelectedHeight({ ...selectedHeight, feet, inches });
                  }
                }
              }
              setShowHeightPicker(true);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dateInputText,
                !height && styles.dateInputPlaceholder,
              ]}
            >
              {height ? formatHeightForDisplay() : `Select your height`}
            </Text>
          </TouchableOpacity>
          {errors.height && (
            <Text style={styles.errorText}>{errors.height}</Text>
          )}
        </View>

        {/* Height Picker Modal */}
        <Modal
          visible={showHeightPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowHeightPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Select Height ({unitSystem === "metric" ? "cm" : "ft'in\""})
              </Text>

              <View style={styles.datePickerContainer}>
                {unitSystem === "metric" ? (
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerLabel}>Centimeters</Text>
                    <ScrollView style={styles.pickerScrollView}>
                      {generateHeightValues().map((value) => (
                        <TouchableOpacity
                          key={value}
                          style={[
                            styles.pickerOption,
                            selectedHeight.metric === value &&
                              styles.pickerOptionSelected,
                          ]}
                          onPress={() =>
                            setSelectedHeight({
                              ...selectedHeight,
                              metric: value,
                            })
                          }
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              selectedHeight.metric === value &&
                                styles.pickerOptionTextSelected,
                            ]}
                          >
                            {value} cm
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : (
                  <>
                    <View style={styles.pickerColumn}>
                      <Text style={styles.pickerLabel}>Feet</Text>
                      <ScrollView style={styles.pickerScrollView}>
                        {generateHeightValues().feet.map((value) => (
                          <TouchableOpacity
                            key={value}
                            style={[
                              styles.pickerOption,
                              selectedHeight.feet === value &&
                                styles.pickerOptionSelected,
                            ]}
                            onPress={() =>
                              setSelectedHeight({
                                ...selectedHeight,
                                feet: value,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.pickerOptionText,
                                selectedHeight.feet === value &&
                                  styles.pickerOptionTextSelected,
                              ]}
                            >
                              {value}'
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={styles.pickerColumn}>
                      <Text style={styles.pickerLabel}>Inches</Text>
                      <ScrollView style={styles.pickerScrollView}>
                        {generateHeightValues().inches.map((value) => (
                          <TouchableOpacity
                            key={value}
                            style={[
                              styles.pickerOption,
                              selectedHeight.inches === value &&
                                styles.pickerOptionSelected,
                            ]}
                            onPress={() =>
                              setSelectedHeight({
                                ...selectedHeight,
                                inches: value,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.pickerOptionText,
                                selectedHeight.inches === value &&
                                  styles.pickerOptionTextSelected,
                              ]}
                            >
                              {value}"
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  onPress={() => setShowHeightPicker(false)}
                  variant="outline"
                  style={styles.modalButton}
                />
                <Button
                  title="Select"
                  onPress={handleHeightSelect}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Weight */}
        <View style={styles.dateContainer}>
          <Text style={styles.label}>
            Weight {unitSystem === "metric" ? "(kg)" : "(lbs)"}
          </Text>
          <TouchableOpacity
            style={[styles.dateInput, errors.weight && styles.dateInputError]}
            onPress={() => {
              // Initialize selectedWeight from current weight value
              if (weight) {
                const weightNum = parseFloat(weight);
                if (!isNaN(weightNum)) {
                  if (unitSystem === "metric") {
                    setSelectedWeight({
                      ...selectedWeight,
                      metric: Math.round(weightNum),
                    });
                  } else {
                    setSelectedWeight({
                      ...selectedWeight,
                      imperial: Math.round(weightNum),
                    });
                  }
                }
              }
              setShowWeightPicker(true);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dateInputText,
                !weight && styles.dateInputPlaceholder,
              ]}
            >
              {weight ? formatWeightForDisplay() : `Select your weight`}
            </Text>
          </TouchableOpacity>
          {errors.weight && (
            <Text style={styles.errorText}>{errors.weight}</Text>
          )}
        </View>

        {/* Weight Picker Modal */}
        <Modal
          visible={showWeightPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowWeightPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Select Weight ({unitSystem === "metric" ? "kg" : "lbs"})
              </Text>

              <View style={styles.datePickerContainer}>
                <View style={styles.pickerColumn}>
                  <Text style={styles.pickerLabel}>
                    {unitSystem === "metric" ? "Kilograms" : "Pounds"}
                  </Text>
                  <ScrollView style={styles.pickerScrollView}>
                    {generateWeightValues().map((value) => (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.pickerOption,
                          (unitSystem === "metric"
                            ? selectedWeight.metric
                            : selectedWeight.imperial) === value &&
                            styles.pickerOptionSelected,
                        ]}
                        onPress={() => {
                          if (unitSystem === "metric") {
                            setSelectedWeight({
                              ...selectedWeight,
                              metric: value,
                            });
                          } else {
                            setSelectedWeight({
                              ...selectedWeight,
                              imperial: value,
                            });
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            (unitSystem === "metric"
                              ? selectedWeight.metric
                              : selectedWeight.imperial) === value &&
                              styles.pickerOptionTextSelected,
                          ]}
                        >
                          {value} {unitSystem === "metric" ? "kg" : "lbs"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  onPress={() => setShowWeightPicker(false)}
                  variant="outline"
                  style={styles.modalButton}
                />
                <Button
                  title="Select"
                  onPress={handleWeightSelect}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>

        {errors.submit ? (
          <Text style={styles.errorText}>{errors.submit}</Text>
        ) : null}

        <View style={styles.buttonContainer}>
          <Button
            title="Continue"
            onPress={validateAndSubmit}
            loading={loading}
            disabled={loading}
            style={styles.submitButton}
          />
          <Button
            title="Skip"
            onPress={handleSkip}
            variant="outline"
            disabled={loading}
            style={styles.skipButton}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    paddingBottom: 40,
  },
  content: {
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: "center",
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
  },
  unitSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  unitButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    marginHorizontal: 6,
  },
  unitButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  unitTextSelected: {
    color: colors.textOnPrimary,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginBottom: 16,
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: 8,
  },
  submitButton: {
    marginBottom: 12,
  },
  skipButton: {
    marginTop: 0,
  },
  dateContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  dateInput: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
    justifyContent: "center",
  },
  dateInputError: {
    borderColor: colors.error,
  },
  dateInputText: {
    fontSize: 16,
    color: colors.text,
  },
  dateInputPlaceholder: {
    color: colors.textLight,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 20,
    textAlign: "center",
  },
  datePickerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    height: 300,
  },
  pickerColumn: {
    flex: 1,
    marginHorizontal: 4,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  pickerScrollView: {
    flex: 1,
  },
  pickerOption: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 2,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  pickerOptionSelected: {
    backgroundColor: colors.primary,
  },
  pickerOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerOptionTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 6,
  },
});
