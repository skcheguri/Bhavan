interface Step {
  number: number;
  label: string;
  icon: string;
}

interface VerificationStepsProps {
  currentStep: number;
  mode?: 'otp' | 'ocr';
}

// OCR verification is a single upload-and-check step, so it collapses
// the middle "OTP" stage into the first one.
const otpSteps: Step[] = [
  { number: 1, label: 'Enter Aadhaar', icon: 'ri-id-card-line' },
  { number: 2, label: 'OTP Verification', icon: 'ri-shield-keyhole-line' },
  { number: 3, label: 'Verified!', icon: 'ri-checkbox-circle-line' },
];

const ocrSteps: Step[] = [
  { number: 1, label: 'Upload Card', icon: 'ri-camera-line' },
  { number: 3, label: 'Verified!', icon: 'ri-checkbox-circle-line' },
];

export default function VerificationSteps({ currentStep, mode = 'otp' }: VerificationStepsProps) {
  const steps = mode === 'ocr' ? ocrSteps : otpSteps;
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((step, idx) => (
        <div key={step.number} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center transition duration-300 ${
                currentStep > step.number
                  ? 'bg-green-500 text-white'
                  : currentStep === step.number
                  ? 'bg-brand text-white'
                  : 'bg-lightgray text-charcoal/40'
              }`}
            >
              {currentStep > step.number ? (
                <i className="ri-check-line text-sm" />
              ) : (
                <i className={`${step.icon} text-sm`} />
              )}
            </div>
            <span
              className={`mt-1.5 text-xs font-medium whitespace-nowrap ${
                currentStep >= step.number ? 'text-charcoal' : 'text-charcoal/40'
              }`}
            >
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`w-16 md:w-24 h-0.5 mb-5 mx-1 transition duration-300 ${
                currentStep > step.number ? 'bg-green-400' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
